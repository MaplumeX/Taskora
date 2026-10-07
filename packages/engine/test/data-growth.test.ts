/**
 * 数据增长（local-first-v3 issue 08）：bootstrap 分页、Logbook 归档、
 * Compact 登记过期。与 convergence 同一接缝：Engine 公共 API + 进程内
 * Sync Hub（真走协议）。
 */

import { describe, expect, it } from 'vitest';

import {
  archiveCutoff,
  COMPACT_REGISTRY_RETENTION_DAYS,
  isArchivedTask,
  openEngine,
  type Engine,
  type EngineChange,
  type SyncTransport,
} from '../src/index';
import { HybridClock } from '../src/hlc';
import { InMemorySyncHub } from '../src/hub';
import { createNodeSqliteStorage } from '../src/node';
import type { WireRow } from '../src/entities';

const USER = 'user-1';
const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-09-30T00:00:00.000Z');
const OLD = new Date(NOW - 400 * DAY).toISOString();
const RECENT = new Date(NOW - 10 * DAY).toISOString();

interface DeviceOptions {
  transport?: SyncTransport;
  archiveAfterDays?: number | null;
  now?: () => number;
}

async function device(hub: InMemorySyncHub, name: string, options: DeviceOptions = {}) {
  return openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: name,
    clock: new HybridClock(name, () => 1_000_000),
    transport: options.transport ?? hub.transportFor(USER),
    archiveAfterDays: options.archiveAfterDays,
    now: options.now ?? (() => NOW),
  });
}

function task(engine: Engine, title: string, extra: WireRow = {}): Promise<string> {
  return engine.create('task', { title, bucket: 'INBOX', status: 'ACTIVE', ...extra });
}

function settled(extra: WireRow = {}): WireRow {
  return { status: 'COMPLETED', settledAt: OLD, bucket: 'LOGBOOK', ...extra };
}

async function taskTitles(engine: Engine): Promise<string[]> {
  return (await engine.list('task')).map((row) => row.fields.title as string).sort();
}

/** 记录每次 bootstrap 请求；gate 返回的 Promise 在请求返回前等待。 */
function recordingTransport(
  inner: SyncTransport,
  gate?: (pageIndex: number) => Promise<void>,
): SyncTransport & { pages: number } {
  const recorder = {
    pages: 0,
    push: (request: Parameters<SyncTransport['push']>[0]) => inner.push(request),
    pull: (request: Parameters<SyncTransport['pull']>[0]) => inner.pull(request),
    async bootstrap(request?: Parameters<SyncTransport['bootstrap']>[0]) {
      const index = recorder.pages;
      recorder.pages += 1;
      const response = await inner.bootstrap(request);
      await gate?.(index);
      return response;
    },
    fetchEntities: inner.fetchEntities,
  };
  return recorder;
}

describe('bootstrap 分页', () => {
  it('按页拉取全部实体与 Compact 登记，cursor 取第一页之前的 fence', async () => {
    const hub = new InMemorySyncHub({ bootstrapPageSize: 3 });
    const a = await device(hub, 'A');
    const ids: string[] = [];
    for (let index = 0; index < 8; index += 1) ids.push(await task(a, `任务 ${index}`));
    await a.create('area', { title: '区域' });
    await a.delete('task', [ids[0]]);
    await a.sync();

    const transport = recordingTransport(hub.transportFor(USER));
    const b = await device(hub, 'B', { transport });
    await b.sync();
    expect(transport.pages).toBe(3);
    expect(await taskTitles(b)).toEqual(await taskTitles(a));
    expect(await b.list('area')).toHaveLength(1);
    expect(await b.isCompacted('task', ids[0])).toBe(true);
    expect(await b.cursor()).toBe(hub.currentSeq(USER));
    await a.close();
    await b.close();
  });

  it('翻页期间 hub 上发生的写在后续 pull 中重放', async () => {
    const hub = new InMemorySyncHub({ bootstrapPageSize: 2 });
    const a = await device(hub, 'A');
    for (let index = 0; index < 6; index += 1) await task(a, `任务 ${index}`);
    await a.sync();

    let late: string | null = null;
    const transport = recordingTransport(hub.transportFor(USER), async (page) => {
      if (page !== 1) return;
      // id 排在所有已读页之前：只有 fence 之后的 pull 能把它带回来
      late = await a.create('task', { id: '0-late', title: '翻页时新建', status: 'ACTIVE' });
      await a.sync();
    });
    const b = await device(hub, 'B', { transport });
    await b.sync();
    expect(late).toBe('0-late');
    await b.sync();
    expect(await taskTitles(b)).toEqual(await taskTitles(a));
    await a.close();
    await b.close();
  });

  it('新设备：第一页到达后即可读到数据，不必等全部页', async () => {
    const hub = new InMemorySyncHub({ bootstrapPageSize: 4 });
    const a = await device(hub, 'A');
    for (let index = 0; index < 12; index += 1) await task(a, `任务 ${index}`);
    await a.sync();

    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reachedSecondPage!: () => void;
    const secondPage = new Promise<void>((resolve) => {
      reachedSecondPage = resolve;
    });
    const transport = recordingTransport(hub.transportFor(USER), async (page) => {
      if (page === 1) {
        reachedSecondPage();
        await blocked;
      }
    });
    const b = await device(hub, 'B', { transport });
    const changes: EngineChange[] = [];
    b.onChange((change) => changes.push(change));
    const syncing = b.sync();
    await secondPage;
    const visible = (await b.list('task')).length;
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(12);
    expect(changes.some((change) => change.origin === 'remote')).toBe(true);
    release();
    await syncing;
    expect(await b.list('task')).toHaveLength(12);
    await a.close();
    await b.close();
  });

  it('已有数据的副本：重建期间读者只看到旧副本或新副本，不会看到半份', async () => {
    const hub = new InMemorySyncHub({ bootstrapPageSize: 5 });
    const a = await device(hub, 'A');
    for (let index = 0; index < 30; index += 1) await task(a, `任务 ${index}`);
    await a.sync();

    // 读循环只让出微任务：翻页也只能等微任务（用定时器会被读循环饿死）
    const transport = recordingTransport(hub.transportFor(USER));
    const b = await device(hub, 'B', { transport });
    await b.sync();

    const counts: number[] = [];
    let done = false;
    const rebuilding = b.bootstrap().finally(() => {
      done = true;
    });
    while (!done) counts.push((await b.list('task')).length);
    await rebuilding;
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((count) => count === 30)).toBe(true);
    await a.close();
    await b.close();
  });

  it('重建时未同步的编辑保留；不是创建、快照里又没有的行不在副本里造残缺行', async () => {
    const hub = new InMemorySyncHub({ bootstrapPageSize: 2 });
    const a = await device(hub, 'A');
    const kept = await task(a, '保留');
    const gone = await task(a, '将被删除');
    await a.sync();

    // 快照不带 Compact 登记：模拟 hub 上的登记已过期
    const inner = hub.transportFor(USER);
    const b = await device(hub, 'B', {
      transport: {
        ...inner,
        bootstrap: async (request) => ({ ...(await inner.bootstrap(request)), compacted: [] }),
      },
    });
    await b.sync();
    await b.update('task', kept, { notes: 'B 的离线备注' });
    await b.update('task', gone, { notes: '写给已删除的行' });
    hub.compact(USER, 'task', [gone]);
    await b.bootstrap();
    expect((await b.get('task', kept))?.fields.notes).toBe('B 的离线备注');
    expect(await b.get('task', gone)).toBeNull();
    expect(await b.pendingCount()).toBe(2);
    await a.close();
    await b.close();
  });
});

describe('Logbook 归档', () => {
  it('归档规则：已了结、早于截止、不在 Trash、不属于进行中的项目', () => {
    const cutoff = archiveCutoff(NOW, 365);
    const base = { status: 'COMPLETED', settledAt: OLD, trashedAt: null, projectId: null };
    expect(isArchivedTask(base, undefined, cutoff)).toBe(true);
    expect(isArchivedTask({ ...base, status: 'CANCELLED' }, undefined, cutoff)).toBe(true);
    expect(isArchivedTask({ ...base, status: 'ACTIVE' }, undefined, cutoff)).toBe(false);
    expect(isArchivedTask({ ...base, settledAt: RECENT }, undefined, cutoff)).toBe(false);
    expect(isArchivedTask({ ...base, settledAt: null }, undefined, cutoff)).toBe(false);
    expect(isArchivedTask({ ...base, trashedAt: OLD }, undefined, cutoff)).toBe(false);
    expect(isArchivedTask({ ...base, projectId: 'p' }, 'ACTIVE', cutoff)).toBe(false);
    expect(isArchivedTask({ ...base, projectId: 'p' }, undefined, cutoff)).toBe(false);
    expect(isArchivedTask({ ...base, projectId: 'p' }, 'COMPLETED', cutoff)).toBe(true);
  });

  it('bootstrap 不拉归档任务及其 Subtask；maintain 按同一规则裁剪副本', async () => {
    const hub = new InMemorySyncHub({ bootstrapPageSize: 3 });
    const a = await device(hub, 'A', { archiveAfterDays: null });
    const activeProject = await a.create('project', { title: '进行中', status: 'ACTIVE' });
    const doneProject = await a.create('project', { title: '已完成', status: 'COMPLETED' });
    const archived = await task(a, '归档', settled());
    await a.create('subtask', { title: '归档的子任务', taskId: archived, status: 'COMPLETED' });
    await a.create('attachment', { taskId: archived, name: '归档的附件.pdf', size: 1 });
    await task(a, '近期了结', settled({ settledAt: RECENT }));
    await task(a, '进行中项目里的旧任务', settled({ projectId: activeProject }));
    await task(a, '已完成项目里的旧任务', settled({ projectId: doneProject }));
    await task(a, '垃圾桶里的旧任务', settled({ trashedAt: OLD }));
    await task(a, '未了结');
    await a.sync();
    await a.maintain();
    expect(await a.list('task')).toHaveLength(6);

    const kept = ['未了结', '近期了结', '进行中项目里的旧任务', '垃圾桶里的旧任务'].sort();
    const b = await device(hub, 'B');
    await b.sync();
    expect(await taskTitles(b)).toEqual(kept);
    expect(await b.list('subtask')).toHaveLength(0);
    expect(await b.list('attachment')).toHaveLength(0);

    // 同一规则：保留全部历史的设备改用 1 年保留期后裁到同样的集合
    const c = await device(hub, 'C', { archiveAfterDays: null });
    await c.sync();
    expect(await c.list('task')).toHaveLength(6);
    const pruning = await device(hub, 'C2');
    await pruning.sync();
    await pruning.maintain();
    expect(await taskTitles(pruning)).toEqual(kept);
    expect(await pruning.list('attachment')).toHaveLength(0);
    await a.close();
    await b.close();
    await c.close();
    await pruning.close();
  });

  it('裁剪只删本地行：不进 Outbox、不登记 compact；有待推送写的任务留下', async () => {
    const hub = new InMemorySyncHub();
    const a = await device(hub, 'A', { archiveAfterDays: null });
    const synced = await task(a, '已同步的旧任务', settled());
    await a.sync();

    const b = await device(hub, 'B');
    await b.pull();
    expect(await b.get('task', synced)).toBeNull();
    const pending = await task(b, '本机刚了结的旧任务', settled());
    const withSubtaskEdit = await task(b, '子任务有待推送写', settled());
    const withAttachmentEdit = await task(b, '附件有待推送写', settled());
    await b.flush();
    await b.create('subtask', { title: '离线加的', taskId: withSubtaskEdit, status: 'ACTIVE' });
    await b.create('attachment', { taskId: withAttachmentEdit, name: '离线加的.pdf', size: 1 });
    await b.update('task', pending, { notes: '离线改' });
    const changes: EngineChange[] = [];
    b.onChange((change) => changes.push(change));
    await b.maintain();
    expect(await taskTitles(b)).toEqual([
      '子任务有待推送写',
      '本机刚了结的旧任务',
      '附件有待推送写',
    ]);
    expect(changes).toEqual([]);
    expect(await b.pendingCount()).toBe(3);

    await b.flush();
    await b.maintain();
    expect(await b.list('task')).toHaveLength(0);
    expect(await b.list('subtask')).toHaveLength(0);
    expect(await b.list('attachment')).toHaveLength(0);
    expect(changes.at(-1)?.ids?.task?.sort()).toEqual(
      [pending, withSubtaskEdit, withAttachmentEdit].sort(),
    );
    expect(await b.isCompacted('task', pending)).toBe(false);
    expect(await b.pendingCount()).toBe(0);
    // hub 上照常存在
    expect(hub.entityState(USER, 'task', pending)).not.toBeNull();
    await a.close();
    await b.close();
  });

  it('归档任务被远端修改后回到副本，并补齐它的 Subtask', async () => {
    const hub = new InMemorySyncHub();
    const a = await device(hub, 'A', { archiveAfterDays: null });
    const archived = await task(a, '旧任务', settled({ createdAt: OLD }));
    await a.create('subtask', { title: '步骤 1', taskId: archived, status: 'COMPLETED' });
    await a.create('subtask', { title: '步骤 2', taskId: archived, status: 'COMPLETED' });
    await a.create('attachment', { taskId: archived, name: '附件.pdf', size: 1 });
    const other = await task(a, '另一个旧任务', settled({ createdAt: OLD }));
    const otherSubtask = await a.create('subtask', {
      title: '另一个的步骤',
      taskId: other,
      status: 'COMPLETED',
    });
    await a.sync();

    const b = await device(hub, 'B');
    await b.sync();
    expect(await b.list('task')).toHaveLength(0);

    // A 重开旧任务；另一个旧任务只改了子任务
    await a.update('task', archived, { status: 'ACTIVE', settledAt: null, bucket: 'INBOX' });
    await a.update('subtask', otherSubtask, { title: '另一个的步骤（改）' });
    await a.sync();
    await b.sync();
    expect((await b.get('task', archived))?.fields.status).toBe('ACTIVE');
    const subtasks = await b.list('subtask', { where: { taskId: archived } });
    expect(subtasks.map((row) => row.fields.title).sort()).toEqual(['步骤 1', '步骤 2']);
    const attachments = await b.list('attachment', { where: { taskId: archived } });
    expect(attachments.map((row) => row.fields.name)).toEqual(['附件.pdf']);
    expect((await b.get('task', other))?.fields.title).toBe('另一个旧任务');

    // 仍是归档状态的那个在下一次维护时再被裁掉
    await b.maintain();
    expect(await b.get('task', other)).toBeNull();
    expect(await b.get('task', archived)).not.toBeNull();
    await a.close();
    await b.close();
  });

  it('补齐失败（断网）时名单保留，下一次 pull 再补', async () => {
    const hub = new InMemorySyncHub();
    const a = await device(hub, 'A', { archiveAfterDays: null });
    const archived = await task(a, '旧任务', settled({ createdAt: OLD }));
    await a.create('subtask', { title: '步骤', taskId: archived, status: 'COMPLETED' });
    await a.sync();

    const inner = hub.transportFor(USER);
    let fetchOnline = false;
    const b = await device(hub, 'B', {
      transport: {
        ...inner,
        fetchEntities: async (request) => {
          if (!fetchOnline) throw new Error('offline');
          return inner.fetchEntities!(request);
        },
      },
    });
    await b.sync();
    await a.update('task', archived, { title: '旧任务（改）' });
    await a.sync();
    await expect(b.pull()).rejects.toThrow('offline');
    expect((await b.get('task', archived))?.fields.title).toBe('旧任务（改）');
    expect(await b.list('subtask')).toHaveLength(0);

    fetchOnline = true;
    await b.pull();
    expect(await b.list('subtask')).toHaveLength(1);
    await a.close();
    await b.close();
  });
});

describe('Compact 登记', () => {
  it('登记超过保留期后由 maintain 清理，未到期的保留', async () => {
    const hub = new InMemorySyncHub();
    let now = NOW;
    const a = await device(hub, 'A', { now: () => now });
    const early = await task(a, '早删');
    const late = await task(a, '晚删');
    await a.sync();
    await a.delete('task', [early]);
    now += 10 * DAY;
    await a.delete('task', [late]);
    await a.sync();

    now = NOW + (COMPACT_REGISTRY_RETENTION_DAYS + 1) * DAY;
    await a.maintain();
    expect(await a.isCompacted('task', early)).toBe(false);
    expect(await a.isCompacted('task', late)).toBe(true);
    await a.close();
  });

  it('收到 Compact Event 时撤掉 Outbox 里对这些实体的待推送写', async () => {
    const hub = new InMemorySyncHub();
    const a = await device(hub, 'A');
    const doomed = await task(a, '将被删');
    await a.create('subtask', { title: '子任务', taskId: doomed, status: 'ACTIVE' });
    await a.sync();

    const b = await device(hub, 'B');
    await b.sync();
    const [subtask] = await b.list('subtask');
    await b.update('task', doomed, { notes: 'B 的离线编辑' });
    await b.update('subtask', subtask.id, { title: 'B 改了子任务' });
    const survivor = await task(b, 'B 的新任务');
    await a.delete('task', [doomed]);
    await a.sync();

    await b.pull();
    expect(await b.get('task', doomed)).toBeNull();
    expect(await b.pendingCount()).toBe(1);
    await b.sync();
    expect(hub.entityState(USER, 'task', survivor)).not.toBeNull();
    await a.close();
    await b.close();
  });
});
