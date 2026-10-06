/**
 * 主接缝：Engine 公共 API 的端到端 harness（spec「Testing Decisions」）。
 *
 * 两台「设备」各跑一个 Engine 实例 + 一个进程内 Sync Hub（真走协议），
 * 测试只通过公共 API（get / list / create / update / flush / pull /
 * 拔线插线）驱动，断言收敛性（两端对同一 list 返回相同结果）与离线
 * 语义（断网期间的写在 flush 后不丢）。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LocalReplica,
  MAX_PUSH_BATCH_BYTES,
  openEngine,
  positionBetween,
  type Engine,
} from '../src/index';
import { HybridClock } from '../src/hlc';
import { InMemorySyncHub } from '../src/hub';
import { formatHlc } from '../src/hlc';
import type { SyncTransport } from '../src/protocol';
import { createNodeSqliteStorage } from '../src/node';
import type { WireRow } from '../src/entities';

const USER = 'user-1';
const HARNESS_NOW = Date.parse('2026-09-30T00:00:00.000Z');

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
        // 归档截止按固定日期算：用例里写死的了结日期不会随时间变成归档
        now: () => HARNESS_NOW,
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
    async bootstrap(request) {
      if (!online) throw new Error('offline');
      return inner.bootstrap(request);
    },
    async fetchEntities(request) {
      if (!online) throw new Error('offline');
      return inner.fetchEntities!(request);
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
  it('flush 飞行期间的新编辑留在 Outbox，并在下一批同步', async () => {
    const hub = new InMemorySyncHub();
    const inner = hub.transportFor(USER);
    let releasePush!: () => void;
    let markPushStarted!: () => void;
    const pushGate = new Promise<void>((resolve) => {
      releasePush = resolve;
    });
    const pushStarted = new Promise<void>((resolve) => {
      markPushStarted = resolve;
    });
    let firstPush = true;
    const transport: SyncTransport = {
      async push(request) {
        if (firstPush) {
          firstPush = false;
          markPushStarted();
          await pushGate;
        }
        return inner.push(request);
      },
      pull: (request) => inner.pull(request),
      bootstrap: (request) => inner.bootstrap(request),
    };
    const engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-race',
      transport,
    });
    const id = await createTask(engine, '并发编辑');

    const flushing = engine.flush();
    await pushStarted;
    await engine.update('task', id, { notes: '请求飞行期间写入' });
    releasePush();
    await flushing;

    expect(await engine.pendingCount()).toBe(0);
    expect(hub.entityState(USER, 'task', id)?.fields.notes).toBe('请求飞行期间写入');
    await engine.close();
  });

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
      (await engine.list('task')).map((row) => row.fields.title).filter(Boolean);
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

  it('回声幂等（真实 hub 序列化口径）：落库值归一化不触发设备应用，本地值不被改写', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    let notifications = 0;
    const unsubscribe = a.onChange(() => {
      notifications += 1;
    });

    await a.sync(); // 空副本首同步：resync → bootstrap（#1）
    const id = await createTask(a, '回声值断言'); // 本地写（#2）
    const before = await a.get('task', id);
    expect(before).not.toBeNull();

    await a.sync(); // 自己的回声：hub 侧列值被归一化（updatedAt =
    // maxWall+1、tagIds 排序），但时钟保持合并
    // 结果 → 逐字段持平 → 零应用、零通知、本地值不被改写。
    expect(notifications).toBe(2);
    const after = await a.get('task', id);
    expect(after).not.toBeNull();
    expect(after!.fields.updatedAt).toBe(before!.fields.updatedAt);
    expect(after!.fields.position).toBe(before!.fields.position);

    unsubscribe();
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

describe('Delete Request（ADR-0008：设备发起删除）', () => {
  it('端到端：A 删除 Task（级联 Subtask），B 同步后消失；幂等重放无新事件', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const taskId = await createTask(a, '要删的');
    const sub1 = await a.create('subtask', { title: '子步骤1', taskId, status: 'ACTIVE' });
    const sub2 = await a.create('subtask', { title: '子步骤2', taskId, status: 'ACTIVE' });
    await a.sync();
    await b.sync();
    expect((await b.list('subtask')).map((r) => r.fields.title).sort()).toEqual([
      '子步骤1',
      '子步骤2',
    ]);

    // 断网删除：本地立即消失（含级联 Subtask）
    h.online(a, false);
    await a.delete('task', [taskId]);
    expect(await a.get('task', taskId)).toBeNull();
    expect(await a.get('subtask', sub1)).toBeNull();
    expect(await a.get('subtask', sub2)).toBeNull();

    // 恢复联网：hub 删除并广播 Compact，B 同步后同样消失
    h.online(a, true);
    await a.sync();
    await b.sync();
    expect(await b.get('task', taskId)).toBeNull();
    expect(await b.get('subtask', sub1)).toBeNull();
    expect(await b.get('subtask', sub2)).toBeNull();
    expect(h.hub.entityState(USER, 'task', taskId)).toBeNull();
    expect(h.hub.entityState(USER, 'subtask', sub1)).toBeNull();

    // 幂等重放：同一 Delete Request 再推一次 → no-op，无新事件
    const seq = h.hub.currentSeq(USER);
    h.hub.transportFor(USER).push({
      deviceId: 'dev-a',
      events: [],
      deletes: [{ entity: 'task', ids: [taskId] }],
    });
    expect(h.hub.currentSeq(USER)).toBe(seq);
    await a.sync();
    await a.close();
    await b.close();
  });

  it('Compact 永久获胜：删除与另一设备并发编辑竞争，不会删了又复活', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a', 1_000);
    const b = await h.device('dev-b', 2_000); // B 的 HLC 更新——即便如此删除仍胜

    const id = await createTask(a, '竞争目标');
    await a.sync();
    await b.sync();

    // B 离线编辑；A 删除并同步（Compact 已广播）
    h.online(b, false);
    await b.update('task', id, { title: 'B 的迟到编辑' });
    await a.delete('task', [id]);
    await a.sync();

    // B 上线：迟到字段写被 hub 丢弃（不重建、无事件），Compact 到达后副本移除
    h.online(b, true);
    await b.sync();
    await a.sync();

    expect(await b.get('task', id)).toBeNull();
    expect(await a.get('task', id)).toBeNull();
    expect(h.hub.entityState(USER, 'task', id)).toBeNull();
    await a.close();
    await b.close();
  });

  it('迟到的 Subtask create 对已 compact 父 Task 被丢弃（无孤儿残留）', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const taskId = await createTask(a, '父任务');
    await a.sync();
    await b.sync();

    await a.delete('task', [taskId]);
    await a.sync();

    // B 离线时已给父任务建了 Subtask（尚不知道删除）
    const subId = await b.create('subtask', { title: '孤儿企图', taskId, status: 'ACTIVE' });
    await b.sync();
    await b.sync();

    // hub 丢弃孤儿写入；B 拉到 Compact 后本地级联清理，副本无残留
    expect(h.hub.entityState(USER, 'subtask', subId)).toBeNull();
    expect(await b.get('subtask', subId)).toBeNull();
    expect(await b.get('task', taskId)).toBeNull();
    await a.close();
    await b.close();
  });

  it('断网重放不丢删除：bootstrap 前 Outbox 里的 Delete Request 照常生效', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const id = await createTask(a, '重建前删除');
    await a.sync();
    await b.sync();

    h.online(a, false);
    await a.delete('task', [id]);
    // 未 flush 就 bootstrap（resync 场景）：删除回放为本地移除，不丢捔
    h.online(a, true);
    await a.bootstrap();
    expect(await a.get('task', id)).toBeNull();

    await a.sync();
    await b.sync();
    expect(await b.get('task', id)).toBeNull();
    await a.close();
    await b.close();
  });

  it('bootstrap 不会用待同步字段写复活 hub 已 compact 的实体', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const id = await createTask(a, '不会复活');
    await a.sync();
    await b.sync();
    await b.update('task', id, { title: '离线迟到编辑' });
    await a.delete('task', [id]);
    await a.sync();

    await b.bootstrap();
    expect(await b.get('task', id)).toBeNull();
    await b.sync();
    expect(await b.get('task', id)).toBeNull();
    expect(h.hub.entityState(USER, 'task', id)).toBeNull();
    expect(await b.pendingCount()).toBe(0);
    await a.close();
    await b.close();
  });

  it('全实体离线：Area/Project/Tag（含父 Tag）/Heading 断网 CRUD 后双端收敛', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');
    h.online(a, false);

    const areaId = await a.create('area', { title: '工作', notes: null, tagIds: [] });
    const parentTagId = await a.create('tag', { title: '语境', color: '#3B82F6', parentId: null });
    const tagId = await a.create('tag', { title: '紧急', color: '#FF0000', parentId: parentTagId });
    const projectId = await a.create('project', {
      title: '装修',
      notes: '新房',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      scheduledType: 'NONE',
      areaId,
      tagIds: [tagId],
      trashedAt: null,
      completedAt: null,
    });
    const headingId = await a.create('project-heading', {
      title: '准备阶段',
      projectId,
      status: 'ACTIVE',
    });
    await a.update('area', areaId, { notes: '生活与工作' });
    await a.update('tag', tagId, { color: '#00FF00' });
    await a.update('project-heading', headingId, { title: '筹备阶段' });

    h.online(a, true);
    await a.sync();
    await b.sync();

    for (const entity of ['area', 'project', 'tag', 'project-heading'] as const) {
      const rowsA = await a.list(entity);
      const rowsB = await b.list(entity);
      expect(rowsB.map((r) => r.fields.title)).toEqual(rowsA.map((r) => r.fields.title));
      expect(rowsB.length).toBeGreaterThan(0);
    }
    expect((await b.get('area', areaId))?.fields.notes).toBe('生活与工作');
    expect((await b.get('tag', tagId))?.fields.color).toBe('#00FF00');
    expect((await b.get('tag', tagId))?.fields.parentId).toBe(parentTagId);
    expect((await b.get('project-heading', headingId))?.fields.title).toBe('筹备阶段');
    expect((await b.get('project', projectId))?.fields.areaId).toBe(areaId);
    await a.close();
    await b.close();
  });

  it('嵌套 Tag：两台设备离线互设父 Tag，hub 断环后双端收敛到同一棵树', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');
    const x = await a.create('tag', { title: 'X', color: '#000000', parentId: null });
    const y = await a.create('tag', { title: 'Y', color: '#000000', parentId: null });
    await a.sync();
    await b.sync();

    h.online(a, false);
    h.online(b, false);
    await a.update('tag', x, { parentId: y });
    await b.update('tag', y, { parentId: x });
    h.online(a, true);
    h.online(b, true);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const engine of [a, b]) {
      expect((await engine.get('tag', x))?.fields.parentId).toBe(y);
      expect((await engine.get('tag', y))?.fields.parentId).toBeNull();
    }
    await a.close();
    await b.close();
  });

  it('删除父 Tag：子 Tag 提升为顶层', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');
    const parent = await a.create('tag', { title: '工作', color: '#000000', parentId: null });
    const child = await a.create('tag', { title: '会议', color: '#000000', parentId: parent });
    await a.sync();
    await b.sync();

    await a.delete('tag', [parent]);
    await a.sync();
    await b.sync();

    for (const engine of [a, b]) {
      expect(await engine.get('tag', parent)).toBeNull();
      expect((await engine.get('tag', child))?.fields.parentId).toBeNull();
    }
    await a.close();
    await b.close();
  });

  it('compact 后引用清理（SetNull 语义）：删 Area 后 Task/Project 的 areaId 置空', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const areaId = await a.create('area', { title: '待删领域', notes: null, tagIds: [] });
    const taskId = await createTask(a, '领域内任务', { areaId });
    const projectId = await a.create('project', {
      title: '领域内项目',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      scheduledType: 'NONE',
      areaId,
    });
    await a.sync();
    await b.sync();

    await a.delete('area', [areaId]);
    await a.sync();
    await b.sync();

    expect(await b.get('area', areaId)).toBeNull();
    // 引用被置空（对齐 hub 侧 onDelete: SetNull），不残留悬挂 areaId
    expect((await b.get('task', taskId))?.fields.areaId).toBeNull();
    expect((await b.get('project', projectId))?.fields.areaId).toBeNull();
    expect((await a.get('task', taskId))?.fields.areaId).toBeNull();
    await a.close();
    await b.close();
  });

  it('emptyTrash 的跨设备生效（主接缝）：trashed Task/Project 物理删除，B 同步后一致', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const keepId = await createTask(a, '留下的');
    const trashedId = await createTask(a, '要删的');
    const projectId = await a.create('project', {
      title: '废弃项目',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      scheduledType: 'NONE',
    });
    const orphanTaskId = await createTask(a, '项目内任务', { projectId });
    await a.create('subtask', { title: '级联子步骤', taskId: orphanTaskId, status: 'ACTIVE' });
    await a.update('task', trashedId, { trashedAt: '2026-01-01T00:00:00.000Z' });
    await a.update('project', projectId, { trashedAt: '2026-01-01T00:00:00.000Z' });
    await a.sync();
    await b.sync();

    // 设备侧 emptyTrash 语义：Trash 内 Task + trashed Project（含其下属
    // Task）批量 Delete Request
    await a.delete('task', [trashedId, orphanTaskId]);
    await a.delete('project', [projectId]);
    await a.sync();
    await b.sync();

    for (const engine of [a, b]) {
      expect(await engine.get('task', trashedId)).toBeNull();
      expect(await engine.get('project', projectId)).toBeNull();
      expect(await engine.list('subtask')).toHaveLength(0);
      expect((await engine.get('task', keepId))?.fields.title).toBe('留下的');
    }
    await a.close();
    await b.close();
  });

  it('convert 组合原语：字段写 + 删除混合批次后双端收敛（顺序不乱）', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    // 模拟 convert 分解：先对原 Task 字段写，再建新 Project + Task，最后删除原 Task
    const taskId = await createTask(a, '原任务', { bucket: 'ANYTIME' });
    const subId = await a.create('subtask', {
      title: '子步骤',
      taskId,
      status: 'COMPLETED',
      settledAt: '2026-01-01T00:00:00.000Z',
    });
    await a.update('task', taskId, { notes: '转换前的最后编辑' });
    const projectId = await a.create('project', {
      title: '新项目',
      notes: '转换前的最后编辑',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      scheduledType: 'NONE',
    });
    const promotedId = await createTask(a, '子步骤', { bucket: 'INBOX', projectId });
    await a.delete('task', [taskId]);
    await a.sync();
    await b.sync();

    // 双端收敛：原 Task 与 Subtask 消失，新 Project 与提升的 Task 存在
    for (const engine of [a, b]) {
      expect(await engine.get('task', taskId)).toBeNull();
      expect(await engine.get('subtask', subId)).toBeNull();
      expect((await engine.get('project', projectId))?.fields.title).toBe('新项目');
      expect((await engine.get('task', promotedId))?.fields.projectId).toBe(projectId);
    }
    expect((await a.list('task')).map((r) => r.fields.title)).toEqual(
      (await b.list('task')).map((r) => r.fields.title),
    );
    await a.close();
    await b.close();
  });
});

describe('Position re-balance（sync 后台摊平超长键）', () => {
  it('反复插队产生超长 Position 后，sync 将整组摊平为短键且顺序不变', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');

    // 制造一个超长键：在固定两键间反复插队
    await createTask(a, '锚点A', { position: 'a0' });
    await createTask(a, '锚点B', { position: 'a1' });
    let current = 'a0';
    for (let i = 0; i < 400; i++) {
      current = positionBetween(current, 'a1');
      await createTask(a, `插队${i}`, { position: current });
    }
    const before = await a.list('task');
    expect(before.some((row) => (row.fields.position as string).length > 24)).toBe(true);

    await a.sync(); // 触发 re-balance

    const after = await a.list('task');
    expect(after.every((row) => (row.fields.position as string).length <= 24)).toBe(true);
    // 顺序保持（标题相对顺序不变）
    expect(after.map((row) => row.fields.title)).toEqual(before.map((row) => row.fields.title));
    // re-balance 的写也进 Outbox → flush 后 hub 收敛
    await a.sync();
    const b = await h.device('dev-b');
    await b.sync();
    expect((await b.list('task')).map((row) => row.fields.title)).toEqual(
      before.map((row) => row.fields.title),
    );
    await a.close();
    await b.close();
  });

  it('同步毒丸防御：离线写引用被删实体，hub 清洗失效引用后两端收敛', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    // 初始状态：任务携带两个标签，A 同步
    const tagX = await b.create('tag', {
      title: 'X',
      color: '#000000',
      parentId: null,
      position: 'a0',
    });
    const tagT = await b.create('tag', {
      title: 'T',
      color: '#111111',
      parentId: null,
      position: 'a1',
    });
    const task = await createTask(b, '带标签', { tagIds: [tagX, tagT] });
    await b.sync();
    await a.sync();
    // hub 归一化会把 tagIds 排序（关系表读回口径），断言用排序后预期
    expect((await a.get('task', task))?.fields.tagIds).toEqual([tagX, tagT].sort());

    // A 离线期间：B 删除 tag T（hub compact），同时 A 改任务标题并保留
    // 对 T 的引用（tagIds 重写携带 T）
    h.online(a, false);
    await b.delete('tag', [tagT]);
    await b.sync();
    await a.update('task', task, { title: '离线改名', tagIds: [tagX, tagT] });

    // A 恢复联网：hub 必须清洗失效引用（而非 FK 拒绝导致毒丸重放），
    // A 拉回清洗值并收敛
    h.online(a, true);
    await a.sync();
    const tagIdsAfter = (await a.get('task', task))?.fields.tagIds;
    expect(tagIdsAfter).toEqual([tagX]);
    expect((await a.get('task', task))?.fields.title).toBe('离线改名');
    // 真实毒丸场景的另一面：B 端状态一致
    await b.sync();
    expect((await b.get('task', task))?.fields.tagIds).toEqual([tagX]);
    await a.close();
    await b.close();
  });

  it('tag compact：副本本地剔除引用实体的 tagIds，通知携带受影响实体', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const tagX = await b.create('tag', {
      title: 'X',
      color: '#000000',
      parentId: null,
      position: 'a0',
    });
    const tagT = await b.create('tag', {
      title: 'T',
      color: '#111111',
      parentId: null,
      position: 'a1',
    });
    const task = await createTask(b, '带标签', { tagIds: [tagX, tagT] });
    await b.sync();
    await a.sync();
    // hub 归一化会把 tagIds 排序（关系表读回口径），断言用排序后预期
    expect((await a.get('task', task))?.fields.tagIds).toEqual([tagX, tagT].sort());

    // 收集 A 端同步过程中的变更通知（实体粒度）
    const notifiedEntities: string[][] = [];
    a.onChange((change) => {
      if (change.entities) notifiedEntities.push([...change.entities].sort());
    });

    await b.delete('tag', [tagT]);
    await b.sync();
    await a.sync(); // pull compact → 副本本地 scrub tagIds

    // 引用实体的 tagIds 在副本本地被剔除（与 hub 关系表级联同口径）
    expect((await a.get('task', task))?.fields.tagIds).toEqual([tagX]);
    // 通知不仅携带 tag，还携带被清理引用的宿主实体（task）——
    // 否则 UI 的 task 缓存不会失效（M2）
    expect(notifiedEntities).toContainEqual(['tag', 'task']);
    await a.close();
    await b.close();
  });

  it('同步毒丸防御：离线写引用被删实体，hub 清洗后两端收敛（设备时钟超前 hub 墙钟）', async () => {
    // 清洗时钟必须晚于事件自身的 HLC（设备时钟可能超前于 hub 墙钟），
    // 否则回声在设备端 LWW 平局下丢失、永不收敛。
    const h = await makeHarness({ wallClock: () => 1_000_000 });
    const a = await h.device('dev-a', 10_000_000_000_000);
    const b = await h.device('dev-b', 10_000_000_000_000);

    const tagX = await b.create('tag', {
      title: 'X',
      color: '#000000',
      parentId: null,
      position: 'a0',
    });
    const tagT = await b.create('tag', {
      title: 'T',
      color: '#111111',
      parentId: null,
      position: 'a1',
    });
    const task = await createTask(b, '带标签', { tagIds: [tagX, tagT] });
    await b.sync();
    await a.sync();

    h.online(a, false);
    await b.delete('tag', [tagT]);
    await b.sync();
    await a.update('task', task, { tagIds: [tagX, tagT] });

    h.online(a, true);
    await a.sync();
    expect((await a.get('task', task))?.fields.tagIds).toEqual([tagX]);
    await a.close();
    await b.close();
  });

  it('孤儿 Subtask 字段写：父 Task 被 compact 后到达的字段写被丢弃', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');

    const task = await createTask(b, '父任务');
    const sub = await b.create('subtask', {
      title: '步骤',
      taskId: task,
      status: 'ACTIVE',
      settledAt: null,
    });
    await b.sync();
    await a.sync();

    // A 离线改 subtask；期间 B 删除父 Task（Delete Request → compact）
    h.online(a, false);
    await b.delete('task', [task]);
    await b.sync();
    await a.update('subtask', sub, { title: '离线改步骤' });

    // A 恢复：字段写被孤儿防御丢弃，副本不复活 subtask
    h.online(a, true);
    await a.sync();
    expect(await a.get('subtask', sub)).toBeNull();
    expect(await a.get('task', task)).toBeNull();
    await a.close();
    await b.close();
  });
});

describe('Compact 登记跨会话持久与 Outbox 因果序', () => {
  it('重启后仍认得已 compact 的 id（Repeat 重派生不复用死 id）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskora-engine-'));
    const path = join(dir, 'replica.db');
    const hub = new InMemorySyncHub();
    const transport = hub.transportFor(USER);
    try {
      const first = await openEngine({
        storage: await createNodeSqliteStorage(path),
        deviceId: 'A',
        transport,
      });
      await first.sync();
      await createTask(first, '派生实例', { id: 'derived-1' });
      await first.sync();
      await first.delete('task', ['derived-1']);
      await first.sync();
      await first.close();

      const restarted = await openEngine({
        storage: await createNodeSqliteStorage(path),
        deviceId: 'A',
        transport,
      });
      expect(await restarted.isCompacted('task', 'derived-1')).toBe(true);
      await restarted.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('推给已 compact id 的迟到写会收到重发的 Compact Event，本地幽灵行被移除', async () => {
    const hub = new InMemorySyncHub();
    const storage = await createNodeSqliteStorage(':memory:');
    const engine = await openEngine({ storage, deviceId: 'A', transport: hub.transportFor(USER) });
    await engine.sync();
    await createTask(engine, '实例', { id: 'derived-1' });
    await engine.sync();
    await engine.delete('task', ['derived-1']);
    await engine.sync();
    // 模拟旧版本：compact 登记只在内存，重启后丢失，复用死 id 再建
    await storage.exec('DELETE FROM _compacted');
    const reopened = await openEngine({
      storage,
      deviceId: 'A',
      transport: hub.transportFor(USER),
    });
    await createTask(reopened, '实例（幽灵）', { id: 'derived-1' });
    await reopened.sync();
    expect(hub.entityState(USER, 'task', 'derived-1')).toBeNull();
    expect(await reopened.get('task', 'derived-1')).toBeNull();
    expect(await reopened.pendingCount()).toBe(0);
    await reopened.close();
  });

  it('跨批次的前向引用不会让同步永久卡死（Outbox 保持因果序）', async () => {
    const hub = new InMemorySyncHub({ enforceReferences: true });
    const engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'A',
      transport: hub.transportFor(USER),
    });
    await engine.sync();
    const early = await createTask(engine, '早建的任务');
    for (let index = 0; index < 600; index += 1) {
      await createTask(engine, `填充 ${index}`);
    }
    const area = await engine.create('area', { title: '晚建的区域' });
    // 旧实现把这条写合并进第 1 行 → 排到 area 创建之前、不同批 → 永久 FK 失败
    await engine.update('task', early, { areaId: area });
    await engine.sync();
    expect(hub.entityState(USER, 'task', early)?.fields.areaId).toBe(area);
    expect(await engine.pendingCount()).toBe(0);
    await engine.close();
  });

  it('push 按体积分批，单批不超过 MAX_PUSH_BATCH_BYTES', async () => {
    const hub = new InMemorySyncHub();
    const inner = hub.transportFor(USER);
    const sizes: number[] = [];
    const transport: SyncTransport = {
      push: (request) => {
        sizes.push(JSON.stringify(request).length);
        return inner.push(request);
      },
      pull: (request) => inner.pull(request),
      bootstrap: (request) => inner.bootstrap(request),
    };
    const engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'A',
      transport,
    });
    await engine.sync();
    for (let index = 0; index < 400; index += 1) {
      await createTask(engine, `离线新建 ${index}`);
    }
    await engine.sync();
    expect(sizes.length).toBeGreaterThan(1);
    // 请求外壳（deviceId 等）只多几十字节
    for (const size of sizes) expect(size).toBeLessThan(MAX_PUSH_BATCH_BYTES + 1024);
    expect(await engine.pendingCount()).toBe(0);
    await engine.close();
  });
});

describe('批量写 / 批量应用 / 事务读闸', () => {
  it('updateMany 与一次 pull 的多条远端变更各只触发一次变更通知', async () => {
    const h = await makeHarness();
    const a = await h.device('A');
    const b = await h.device('B');
    await a.sync();
    await b.sync();
    const ids: string[] = [];
    for (let index = 0; index < 20; index += 1) ids.push(await createTask(a, `任务 ${index}`));
    await a.sync();

    const localEvents: string[] = [];
    const offA = a.onChange((change) => localEvents.push(change.origin));
    await a.updateMany(
      'task',
      ids.map((id, index) => ({ id, patch: { title: `改 ${index}` } })),
    );
    expect(localEvents).toEqual(['local']);
    offA();
    await a.sync();

    const remoteEvents: string[] = [];
    b.onChange((change) => remoteEvents.push(change.origin));
    await b.sync();
    expect(remoteEvents.filter((origin) => origin !== 'bootstrap')).toEqual(['remote']);
    expect((await b.list('task')).map((row) => row.fields.title)).toContain('改 19');
    await a.close();
    await b.close();
  });

  it('bootstrap 重建期间的并发读看不到空表或半份数据', async () => {
    const h = await makeHarness();
    const a = await h.device('A');
    await a.sync();
    for (let index = 0; index < 50; index += 1) await createTask(a, `任务 ${index}`);
    await a.sync();

    const counts: number[] = [];
    let done = false;
    const rebuilding = a.bootstrap().finally(() => {
      done = true;
    });
    while (!done) {
      counts.push((await a.list('task')).length);
    }
    await rebuilding;
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((count) => count === 50)).toBe(true);
    await a.close();
  });
});

describe('list 的 SQL 预过滤', () => {
  it('支持相等 / IS NULL / IS NOT NULL / IN / limit，并拒绝未知或 JSON 字段', async () => {
    const engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'A',
    });
    const project = await engine.create('project', { title: 'P' });
    const a = await createTask(engine, 'a', { projectId: project, position: 'a0' });
    const b = await createTask(engine, 'b', { status: 'COMPLETED', position: 'a1' });
    const c = await createTask(engine, 'c', { trashedAt: '2026-01-01T00:00:00Z', position: 'a2' });
    const ids = async (options: Parameters<Engine['list']>[1]) =>
      (await engine.list('task', options)).map((row) => row.id);

    expect(await ids({ where: { projectId: project } })).toEqual([a]);
    expect(await ids({ where: { status: 'ACTIVE', trashedAt: null } })).toEqual([a]);
    expect(await ids({ where: { trashedAt: { notNull: true } } })).toEqual([c]);
    expect(await ids({ where: { id: { in: [c, b] } } })).toEqual([b, c]);
    expect(await ids({ where: { id: { in: [] } } })).toEqual([]);
    expect(await ids({ limit: 1 })).toEqual([a]);
    await expect(engine.list('task', { where: { tagIds: 'x' } })).rejects.toThrow();
    await expect(engine.list('task', { where: { 'id; DROP TABLE task': 'x' } })).rejects.toThrow();
    await engine.close();
  });
});

describe('HLC 跨会话持久', () => {
  it('墙钟不动时重启后发号仍严格递增；一次写只用一个时间戳', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'taskora-hlc-'));
    const path = join(dir, 'replica.db');
    try {
      const open = async () =>
        openEngine({
          storage: await createNodeSqliteStorage(path),
          deviceId: 'A',
          clock: new HybridClock('A', () => 1_000),
        });
      const first = await open();
      const id = await createTask(first, 'x');
      const replica = new LocalReplica(await createNodeSqliteStorage(path), { deviceId: 'A' });
      const created = await replica.get('task', id);
      expect(new Set(Object.values(created!.clocks)).size).toBe(1);
      const createdStamp = Object.values(created!.clocks)[0];
      await first.close();

      const second = await open();
      await second.update('task', id, { title: 'y' });
      const updated = await replica.get('task', id);
      expect(updated!.clocks.title > createdStamp).toBe(true);
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('设备时钟按 hub 时间校准（ADR-0007）', () => {
  it('系统时钟快一天的设备校准后，不再压过其他设备之后的编辑', async () => {
    let hubNow = 5_000_000_000;
    const hub = new InMemorySyncHub({ wallClock: () => hubNow, reportServerTime: true });
    const fast = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'fast',
      clock: new HybridClock('fast', () => hubNow + 24 * 3600 * 1000),
      transport: hub.transportFor(USER),
    });
    const honest = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'honest',
      clock: new HybridClock('honest', () => hubNow),
      transport: hub.transportFor(USER),
    });
    await fast.sync();
    await honest.sync();
    const id = await createTask(honest, '原标题');
    await honest.sync();
    await fast.sync();

    hubNow += 1_000;
    await fast.update('task', id, { title: '快钟设备的编辑' });
    await fast.sync();
    hubNow += 1_000;
    await honest.sync();
    await honest.update('task', id, { title: '之后的编辑' });
    await honest.sync();
    await fast.sync();

    expect((await fast.get('task', id))?.fields.title).toBe('之后的编辑');
    expect((await honest.get('task', id))?.fields.title).toBe('之后的编辑');
    await fast.close();
    await honest.close();
  });

  it('往返中点带 .5 的校准不产生小数墙钟：新建后输入的标题同步到其他设备', async () => {
    const hub = new InMemorySyncHub({ wallClock: () => 5_000_000_000, reportServerTime: true });
    // 每读一次系统时钟前进 tick 毫秒：奇数时请求往返中点落在半毫秒上
    let deviceNow = 4_000_000_000;
    let tick = 1;
    const creator = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'creator',
      clock: new HybridClock('creator', () => (deviceNow += tick)),
      transport: hub.transportFor(USER),
    });
    const other = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'other',
      transport: hub.transportFor(USER),
    });
    await creator.sync(); // 校准偏移 x.5
    await other.sync();
    const id = await createTask(creator, ''); // 旧版：小数墙钟 create
    tick = 2;
    await creator.sync(); // 校准偏移回到整数
    await creator.update('task', id, { title: '新任务' }); // 整数墙钟
    await creator.sync();
    await other.sync();

    expect((await creator.get('task', id))?.fields.title).toBe('新任务');
    expect((await other.get('task', id))?.fields.title).toBe('新任务');
    await creator.close();
    await other.close();
  });
});

describe('旧版小数墙钟时间戳的一次性修复', () => {
  /** 第一次发号返回旧版小数时间戳（模拟升级前留在副本里的 create）。 */
  class LegacyOnceClock extends HybridClock {
    private legacy = true;
    override now(): string {
      if (!this.legacy) return super.now();
      this.legacy = false;
      return '5000000000000.5:000000:A';
    }
  }

  it('hub 声明协议 3 后重推被字典序丢弃的写，并 bootstrap 收回', async () => {
    const hub = new InMemorySyncHub();
    const inner = hub.transportFor(USER);
    // 旧 hub：协议 2，按字典序把「之后的整数时间戳」写丢弃（这里直接吞掉
    // 不带 createdAt 的局部写，照常 ack）
    let legacyHub = true;
    const version = <T extends object>(response: T): T =>
      legacyHub ? { ...response, protocolVersion: 2 } : response;
    const transport: SyncTransport = {
      async push(request) {
        const events = legacyHub
          ? request.events.filter((event) => 'createdAt' in event.fields)
          : request.events;
        return version(await inner.push({ ...request, events }));
      },
      pull: async (request) => version(await inner.pull(request)),
      bootstrap: async (request) => version(await inner.bootstrap(request)),
      fetchEntities: async (request) => version(await inner.fetchEntities!(request)),
    };
    const a = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'A',
      clock: new LegacyOnceClock('A', () => 5_000_000_001_000),
      transport,
    });
    const b = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'B',
      transport: hub.transportFor(USER),
    });
    await a.sync();
    const id = await createTask(a, '');
    await a.sync();
    await a.update('task', id, { title: '新任务' });
    await a.sync();
    await b.sync();
    // 症状：本机有标题，其他设备为空
    expect((await a.get('task', id))?.fields.title).toBe('新任务');
    expect((await b.get('task', id))?.fields.title).toBe('');

    legacyHub = false;
    await a.sync();
    await b.sync();
    expect((await b.get('task', id))?.fields.title).toBe('新任务');
    expect((await a.get('task', id))?.fields.title).toBe('新任务');
    expect(await a.pendingCount()).toBe(0);
    // 只修一次：之后的同步不再重推
    await a.update('task', id, { notes: 'x' });
    await a.sync();
    expect(await a.pendingCount()).toBe(0);
    await a.close();
    await b.close();
  });
});

describe('同步时的局部 re-balance', () => {
  it('只改写膨胀的那一行，其余行不进 Outbox', async () => {
    const hub = new InMemorySyncHub();
    const engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'A',
      transport: hub.transportFor(USER),
    });
    await engine.sync();
    for (const position of ['a0', 'a1', 'a2', 'a3']) {
      await createTask(engine, position, { position });
    }
    const inflated = await createTask(engine, 'inflated', { position: 'a1' + 'V'.repeat(30) });
    await engine.sync(); // flush → pull → re-balance（写入留待下一轮推送）
    expect(await engine.pendingCount()).toBe(1);
    const fixed = (await engine.get('task', inflated))!.fields.position as string;
    expect(fixed.length).toBeLessThanOrEqual(24);
    expect((await engine.list('task')).map((row) => row.fields.title)).toEqual([
      'a0',
      'a1',
      'inflated',
      'a2',
      'a3',
    ]);
    await engine.sync();
    expect(await engine.pendingCount()).toBe(0);
    await engine.close();
  });
});

describe('跨字段不变量：并发编辑合并后确定性修复（local-first-v3 01）', () => {
  /** 两台设备先同步到同一状态，然后各自离线编辑，再先后联网。 */
  async function concurrently(
    setup: (a: Engine) => Promise<string>,
    editA: (a: Engine, id: string) => Promise<void>,
    editB: (b: Engine, id: string) => Promise<void>,
  ) {
    const h = await makeHarness();
    const a = await h.device('A');
    // B 的墙钟更晚：它的编辑在字段级 LWW 中一定胜出，冲突组合必然形成
    const b = await h.device('B', 2_000_000);
    await a.sync();
    const id = await setup(a);
    await a.sync();
    await b.sync();
    h.online(a, false);
    h.online(b, false);
    await editA(a, id);
    await editB(b, id);
    h.online(a, true);
    h.online(b, true);
    await a.sync();
    await b.sync();
    await a.sync();
    const fieldsA = (await a.get('task', id))!.fields;
    const fieldsB = (await b.get('task', id))!.fields;
    const hub = h.hub.entityState(USER, 'task', id)!.fields;
    return { a, b, fieldsA, fieldsB, hub };
  }

  it('A 换项目、B 设了原项目的分组 → 分组被清空，三方一致', async () => {
    let p2 = '';
    let h1 = '';
    const { fieldsA, fieldsB, hub } = await concurrently(
      async (a) => {
        const p1 = await a.create('project', { title: 'P1', status: 'ACTIVE', bucket: 'ANYTIME' });
        p2 = await a.create('project', { title: 'P2', status: 'ACTIVE', bucket: 'ANYTIME' });
        h1 = await a.create('project-heading', { title: 'H1', projectId: p1, status: 'ACTIVE' });
        return createTask(a, 't', { projectId: p1, bucket: 'ANYTIME', scheduledType: 'NONE' });
      },
      (a, id) => a.update('task', id, { projectId: p2, headingId: null }),
      (b, id) => b.update('task', id, { headingId: h1 }),
    );
    for (const fields of [fieldsA, fieldsB, hub]) {
      expect(fields.projectId).toBe(p2);
      expect(fields.headingId).toBeNull();
    }
  });

  it('A 移到 Someday、B 设了提醒 → Someday 任务不带提醒', async () => {
    const { fieldsA, fieldsB, hub } = await concurrently(
      (a) =>
        createTask(a, 't', {
          scheduledType: 'DATE',
          scheduledDate: '2026-10-01',
          bucket: 'SCHEDULED',
        }),
      (a, id) =>
        a.update('task', id, {
          scheduledType: 'SOMEDAY',
          scheduledDate: null,
          reminderTime: null,
          repeatRule: null,
          bucket: 'SCHEDULED',
        }),
      (b, id) => b.update('task', id, { reminderTime: '09:00' }),
    );
    for (const fields of [fieldsA, fieldsB, hub]) {
      expect(fields.scheduledType).toBe('SOMEDAY');
      expect(fields.reminderTime).toBeNull();
    }
  });

  it('A 设日期、B 把任务移到 Anytime → 落在 Scheduled', async () => {
    const { fieldsA, fieldsB, hub } = await concurrently(
      (a) => createTask(a, 't', { scheduledType: 'NONE', bucket: 'INBOX' }),
      (a, id) =>
        a.update('task', id, {
          scheduledType: 'DATE',
          scheduledDate: '2026-10-01',
          bucket: 'SCHEDULED',
        }),
      (b, id) => b.update('task', id, { bucket: 'ANYTIME' }),
    );
    for (const fields of [fieldsA, fieldsB, hub]) {
      expect(fields.scheduledType).toBe('DATE');
      expect(fields.bucket).toBe('SCHEDULED');
    }
  });

  it('A 重开任务、B（旧客户端）只写了结时间 → 未了结且没有了结时间', async () => {
    const { fieldsA, fieldsB, hub } = await concurrently(
      (a) =>
        createTask(a, 't', {
          scheduledType: 'NONE',
          status: 'COMPLETED',
          settledAt: '2026-09-01T00:00:00.000Z',
        }),
      (a, id) => a.update('task', id, { status: 'ACTIVE', settledAt: null }),
      (b, id) => b.update('task', id, { settledAt: '2026-09-02T00:00:00.000Z' }),
    );
    for (const fields of [fieldsA, fieldsB, hub]) {
      expect(fields.status).toBe('ACTIVE');
      expect(fields.settledAt).toBeNull();
    }
  });

  it('没有冲突的并发编辑不触发修复：写入方的回声零应用', async () => {
    const h = await makeHarness();
    const a = await h.device('A');
    await a.sync();
    const id = await createTask(a, 't', { scheduledType: 'NONE', bucket: 'INBOX' });
    await a.sync();
    const remote: string[] = [];
    a.onChange((change) => {
      if (change.origin === 'remote') remote.push('remote');
    });
    await a.update('task', id, {
      scheduledType: 'DATE',
      scheduledDate: '2026-10-01',
      bucket: 'SCHEDULED',
      reminderTime: '09:00',
    });
    await a.sync();
    expect(remote).toEqual([]);
  });
});
