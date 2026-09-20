/**
 * 主接缝：Engine 公共 API 的端到端 harness（spec「Testing Decisions」）。
 *
 * 两台「设备」各跑一个 Engine 实例 + 一个进程内 Sync Hub（真走协议），
 * 测试只通过公共 API（get / list / create / update / flush / pull /
 * 拔线插线）驱动，断言收敛性（两端对同一 list 返回相同结果）与离线
 * 语义（断网期间的写在 flush 后不丢）。
 */

import { describe, expect, it } from 'vitest';

import { openEngine, type Engine } from '../src/engine';
import { HybridClock } from '../src/hlc';
import { InMemorySyncHub } from '../src/hub';
import { formatHlc } from '../src/hlc';
import type { SyncTransport } from '../src/protocol';
import { createNodeSqliteStorage } from '../src/node';
import type { WireRow } from '../src/entities';

const USER = 'user-1';

interface Harness {
  hub: InMemorySyncHub;
  device(name: string, wallMs?: number): Promise<Engine>;
  /** 拔线/插线（模拟断网）。 */
  online(engine: Engine, value: boolean): void;
}

async function makeHarness(options: { wallClock?: () => number } = {}): Promise<Harness> {
  const hub = new InMemorySyncHub({ wallClock: options.wallClock });
  const nets = new WeakMap<Engine, { setOnline(v: boolean): void }>();
  return {
    hub,
    async device(name: string, wallMs = 1_000_000): Promise<Engine> {
      const storage = await createNodeSqliteStorage(':memory:');
      const net = wrapTransport(hub.transportFor(USER));
      const engine = await openEngine({
        storage,
        deviceId: name,
        clock: new HybridClock(name, () => wallMs),
        transport: net,
      });
      nets.set(engine, net);
      return engine;
    },
    online(engine, value) {
      nets.get(engine)?.setOnline(value);
    },
  };
}

/** 可拔线的 transport：offline 时 push/pull 抛错。 */
function wrapTransport(inner: SyncTransport): SyncTransport & { setOnline(v: boolean): void } {
  let online = true;
  return {
    setOnline(value: boolean) {
      online = value;
    },
    async push(request) {
      if (!online) throw new Error('offline');
      return inner.push(request);
    },
    async pull(request) {
      if (!online) throw new Error('offline');
      return inner.pull(request);
    },
    async bootstrap() {
      if (!online) throw new Error('offline');
      return inner.bootstrap();
    },
  };
}

async function titles(engine: Engine): Promise<string[]> {
  const rows = await engine.list('task');
  return rows.map((row) => row.fields.title as string);
}

async function taskByTitle(
  engine: Engine,
  title: string,
): Promise<{ id: string; fields: WireRow } | undefined> {
  const rows = await engine.list('task');
  return rows.find((row) => row.fields.title === title);
}

async function createTask(engine: Engine, title: string, extra: WireRow = {}): Promise<string> {
  return engine.create('task', { title, bucket: 'INBOX', status: 'ACTIVE', ...extra });
}

describe('Engine 端到端收敛（主接缝）', () => {
  it('离线可用：断网期间创建/编辑/完成任务全功能，get 即时可见', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    h.online(a, false);

    const id = await createTask(a, '买牛奶');
    await a.update('task', id, { notes: '两盒' });
    await a.update('task', id, { status: 'COMPLETED', settledAt: '2026-01-02T00:00:00.000Z' });

    const task = await a.get('task', id);
    expect(task?.fields.title).toBe('买牛奶');
    expect(task?.fields.notes).toBe('两盒');
    expect(task?.fields.status).toBe('COMPLETED');
    expect(await a.pendingCount()).toBe(1); // Outbox 合并同类 pending

    // 恢复联网后自动同步，不丢任何编辑
    h.online(a, true);
    await a.sync();
    expect(await a.pendingCount()).toBe(0);

    const b = await h.device('dev-b');
    await b.sync();
    expect(await titles(b)).toEqual(['买牛奶']);
    expect((await b.get('task', id))?.fields.notes).toBe('两盒');
    await a.close();
    await b.close();
  });

  it('多设备收敛：A 创建 B 可见，B 完成后 A 的 Today 视图消失', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const id = await createTask(a, '写周报', {
      bucket: 'ANYTIME',
      scheduledType: 'DATE',
      scheduledDate: '2026-01-02',
    });
    await a.sync();
    await b.sync();
    expect(await titles(b)).toEqual(['写周报']);

    await b.update('task', id, { status: 'COMPLETED', settledAt: '2026-01-02T08:00:00.000Z' });
    await b.sync();
    await a.sync();

    const today = async (engine: Engine) =>
      (await engine.list('task'))
        .filter(
          (row) =>
            row.fields.status === 'ACTIVE' &&
            row.fields.scheduledDate === '2026-01-02' &&
            row.fields.trashedAt == null,
        )
        .map((row) => row.fields.title);
    expect(await today(a)).toEqual([]);
    expect((await a.get('task', id))?.fields.status).toBe('COMPLETED');
    await a.close();
    await b.close();
  });

  it('字段级合并：A 改标题、B 同时改截止日期，两个改动都保留', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const id = await createTask(a, '订机票');
    await a.sync();
    await b.sync();

    // 两端并发离线编辑不同字段
    await a.update('task', id, { title: '订去东京的机票' });
    await b.update('task', id, { dueDate: '2026-02-01' });
    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();

    const merged = (await a.get('task', id))?.fields;
    expect(merged?.title).toBe('订去东京的机票');
    expect(merged?.dueDate).toBe('2026-02-01');
    // 两端收敛到同一结果
    expect((await a.get('task', id))?.fields).toEqual((await b.get('task', id))?.fields);
    await a.close();
    await b.close();
  });

  it('同字段真并发：HLC 新者胜 + 设备 ID 决胜，两端收敛一致', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a', 1_000); // A 先写
    const b = await h.device('dev-b', 2_000); // B 后写（HLC 更新）

    const id = await createTask(a, '买菜');
    await a.sync();
    await b.sync();

    await a.update('task', id, { title: 'A 的标题' });
    await b.update('task', id, { title: 'B 的标题' });
    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();

    // B 的 HLC 更新 → 胜；两端一致（静默收敛，无冲突 UI）
    expect((await a.get('task', id))?.fields.title).toBe('B 的标题');
    expect((await a.get('task', id))?.fields).toEqual((await b.get('task', id))?.fields);
    await a.close();
    await b.close();
  });

  it('同墙钟并发：合并结果确定，两端收敛一致（决胜细节见 merger 单测）', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a', 5_000);
    const b = await h.device('dev-b', 5_000); // 完全相同的墙钟

    const id = await createTask(a, '并排写');
    await a.sync();
    await b.sync();

    await a.update('task', id, { title: 'A 的标题' });
    await b.update('task', id, { title: 'B 的标题' });
    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();

    // B 拉取过 A 的创建（时钟已吸收），其后的写在因果序上必然更新 → B 胜
    const finalTitle = (await a.get('task', id))?.fields.title;
    expect(['A 的标题', 'B 的标题']).toContain(finalTitle);
    expect(finalTitle).toBe('B 的标题');
    expect((await a.get('task', id))?.fields).toEqual((await b.get('task', id))?.fields);
    await a.close();
    await b.close();
  });

  it('Position 并发拖拽：两端收敛到同一顺序，无需重排他人', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const ids = [
      await createTask(a, 'T1', { position: 'a0' }),
      await createTask(a, 'T2', { position: 'a1' }),
      await createTask(a, 'T3', { position: 'a2' }),
    ];
    await a.sync();
    await b.sync();

    // A 把 T3 拖到 T1 前面；B 离线把 T2 拖到 T3 后面
    await a.update('task', ids[2], { position: 'Zz' }); // < a0
    await b.update('task', ids[1], { position: 'a3' }); // > a2
    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();

    const order = async (engine: Engine) =>
      (await engine.list('task'))
        .map((row) => row.fields.title)
        .filter(Boolean);
    expect(await order(a)).toEqual(await order(b));
    expect(await order(a)).toEqual(['T3', 'T1', 'T2']);
    await a.close();
    await b.close();
  });

  it('自身回声与重复 flush 幂等：不产生重复应用或事件风暴', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    await createTask(a, '回声测试');
    await a.sync();
    const seqAfterFirst = h.hub.currentSeq(USER);

    await a.sync(); // 自己的变更回声回来
    await a.sync(); // 再拉一次
    expect(h.hub.currentSeq(USER)).toBe(seqAfterFirst); // 无新事件
    expect(await a.pendingCount()).toBe(0);
    await a.close();
  });

  it('Compact Event：hub GC 后其他设备的副本里实体消失', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const id1 = await createTask(a, '垃圾1');
    const id2 = await createTask(a, '垃圾2');
    const keepId = await createTask(a, '保留');
    await a.sync();
    await b.sync();
    expect((await titles(b)).sort()).toEqual(['保留', '垃圾1', '垃圾2']);

    h.hub.compact(USER, 'task', [id1, id2]);
    await b.sync();
    await a.sync();

    expect(await titles(b)).toEqual(['保留']);
    expect(await titles(a)).toEqual(['保留']);
    expect(await a.get('task', keepId)).not.toBeNull();
    expect(await a.get('task', id1)).toBeNull();
    await a.close();
    await b.close();
  });

  it('快照重建：新设备 bootstrap 后获得全量数据与 cursor，之后走增量', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    await createTask(a, '旧任务1');
    await createTask(a, '旧任务2', { status: 'COMPLETED', settledAt: '2026-01-01T00:00:00.000Z' });
    await a.sync();

    const c = await h.device('dev-c');
    await c.bootstrap();
    expect((await titles(c)).sort()).toEqual(['旧任务1', '旧任务2']);

    // 增量路径正常
    const id = await createTask(a, '增量任务');
    await a.sync();
    await c.sync();
    expect((await c.get('task', id))?.fields.title).toBe('增量任务');
    await a.close();
    await c.close();
  });

  it('快照重建不丢未同步编辑：bootstrap 后 Outbox 照常 flush 收敛', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    await createTask(a, '已同步');
    await a.sync();

    const b = await h.device('dev-b');
    await b.sync();
    const offlineId = await createTask(b, 'B 的离线任务');
    await b.update('task', offlineId, { notes: '离线备注' });
    // B 未 flush 就 bootstrap（resync 场景）
    await b.bootstrap();
    expect((await b.get('task', offlineId))?.fields.title).toBe('B 的离线任务');

    await b.sync();
    await a.sync();
    expect((await titles(a)).sort()).toEqual(['B 的离线任务', '已同步']);
    await a.close();
    await b.close();
  });

  it('虚拟设备 0（Assistant）：hub 侧写像另一台设备一样到达', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const id = await createTask(a, '我建的任务');
    await a.sync();

    // Assistant 以虚拟设备 0 的身份提交字段级写（进程内调用，无特权路径）
    const later = formatHlc({ wallMs: 9_000_000, counter: 0, deviceId: '0' });
    h.hub.submitVirtualWrite(USER, {
      entity: 'task',
      id,
      fields: {
        title: { value: '我建的任务（助手改名）', hlc: later },
        notes: { value: '助手备注', hlc: later },
      },
    });
    await a.sync();

    expect((await a.get('task', id))?.fields.title).toBe('我建的任务（助手改名）');
    expect((await a.get('task', id))?.fields.notes).toBe('助手备注');
    await a.close();
  });

  it('hub 重启（seq 跳变）：设备被推入 resync → bootstrap → 收敛', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    await createTask(a, '重启前');
    await a.sync();

    h.hub.restart();
    await createTask(a, '重启后');
    await a.sync();
    await a.sync(); // resync 后自动 bootstrap，再 pull

    expect((await titles(a)).sort()).toEqual(['重启前', '重启后']);

    const b = await h.device('dev-b');
    await b.sync();
    expect((await titles(b)).sort()).toEqual(['重启前', '重启后']);
    await a.close();
    await b.close();
  });

  it('变更通知：本地写与应用远端写触发 onChange，纯回声不触发', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    let notifications = 0;
    const unsubscribe = a.onChange(() => {
      notifications += 1;
    });

    await createTask(a, '本地写'); // 1：本地写
    await a.sync(); // 首次同步 resync → bootstrap，整表替换再触发 1 次
    expect(notifications).toBe(2);
    await a.sync(); // 自身回声：无变更 → 不触发
    expect(notifications).toBe(2);

    await b.sync(); // b 拉取（无关于 a）
    const id = await taskByTitle(a, '本地写');
    await b.update('task', id!.id, { notes: '远端写' });
    await b.sync();
    await a.sync(); // 应用远端写 → 3
    expect(notifications).toBe(3);

    unsubscribe();
    await createTask(a, '不应触发');
    expect(notifications).toBe(3);
    await a.close();
    await b.close();
  });
});
