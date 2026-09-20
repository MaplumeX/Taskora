/**
 * 主接缝：Engine 公共 API 的端到端 harness（spec「Testing Decisions」）。
 *
 * 两台「设备」各跑一个 Engine 实例 + 一个进程内 Sync Hub（真走协议），
 * 测试只通过公共 API（get / list / create / update / flush / pull /
 * 拔线插线）驱动，断言收敛性（两端对同一 list 返回相同结果）与离线
 * 语义（断网期间的写在 flush 后不丢）。
 */

import { describe, expect, it } from 'vitest';

import { openEngine, positionBetween, type Engine } from '../src/index';
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

  it('全实体离线：Area/Project/Tag/TagGroup/Heading 断网 CRUD 后双端收敛', async () => {
    const h = await makeHarness();
    const a = await h.device('dev-a');
    const b = await h.device('dev-b');
    h.online(a, false);

    const areaId = await a.create('area', { title: '工作', notes: null, tagIds: [] });
    const groupId = await a.create('tag-group', { title: '语境' });
    const tagId = await a.create('tag', { title: '紧急', color: '#FF0000', tagGroupId: groupId });
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

    for (const entity of ['area', 'project', 'tag', 'tag-group', 'project-heading'] as const) {
      const rowsA = await a.list(entity);
      const rowsB = await b.list(entity);
      expect(rowsB.map((r) => r.fields.title)).toEqual(rowsA.map((r) => r.fields.title));
      expect(rowsB.length).toBeGreaterThan(0);
    }
    expect((await b.get('area', areaId))?.fields.notes).toBe('生活与工作');
    expect((await b.get('tag', tagId))?.fields.color).toBe('#00FF00');
    expect((await b.get('project-heading', headingId))?.fields.title).toBe('筹备阶段');
    expect((await b.get('project', projectId))?.fields.areaId).toBe(areaId);
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
});
