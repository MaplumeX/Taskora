/**
 * 数据增长（local-first-v3 issue 08，真实 Postgres）：分页快照与归档省略、
 * 按 id 取实体、Compact 登记随日志清理，以及登记清理后设备迟到的写
 * 不会复活实体、也不会让 push 永远失败。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  archiveCutoff,
  formatHlc,
  openEngine,
  SYNC_PROTOCOL_VERSION,
  type OutboxEvent,
  type SyncTransport,
} from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';

import { FeedService } from '../src/feed/feed.service';
import { PrismaSyncChangeLog } from '../src/sync/prisma-sync-change-log.service';
import { SYNC_LOG_RETENTION_DAYS } from '../src/sync/sync-change-log';
import { SyncHubService } from '../src/sync/sync-hub.service';
import { BOOTSTRAP_PAGE_SIZE } from '../src/sync/snapshot-pages';
import { disconnectTestDb, resetDb, testPrisma, testPrismaService } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;
const e2eDescribe = hasTestDb ? describe : describe.skip;

const USER = 'user-data-growth';
const OTHER = 'user-data-growth-other';
const DAY = 24 * 3600 * 1000;
const prisma = testPrismaService();
const OLD = new Date(Date.now() - 400 * DAY);
const RECENT = new Date(Date.now() - 10 * DAY);
const CUTOFF = archiveCutoff(Date.now(), 365);

function newHub() {
  const log = new PrismaSyncChangeLog(prisma);
  return { log, hub: new SyncHubService(prisma, log) };
}

/** 设备的 HTTP 传输换成直接调用 hub（协议 2：分页 bootstrap、按 id 取实体）。 */
function transportFor(hub: SyncHubService, log: PrismaSyncChangeLog): SyncTransport {
  const stamped = <T extends object>(response: T) => ({
    ...response,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    minProtocolVersion: 0,
  });
  return {
    push: async (request) => stamped(await hub.push(USER, request.events, request.deletes)),
    pull: async (request) => stamped(await log.pull(USER, request.cursor)),
    bootstrap: async (request) => stamped(await hub.bootstrapPage(USER, request ?? {})),
    fetchEntities: async (request) =>
      stamped(await hub.fetchEntities(USER, request.entity, request.ids)),
  };
}

function taskEvent(id: string, fields: Record<string, unknown>, counter = 0): OutboxEvent {
  const hlc = formatHlc({ wallMs: Date.now(), counter, deviceId: 'dev-growth' });
  return {
    entity: 'task',
    id,
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, value]) => [name, { value, hlc }]),
    ),
  };
}

e2eDescribe('数据增长（真实 Postgres）', () => {
  beforeEach(async () => {
    await resetDb();
    await testPrisma.user.createMany({
      data: [
        { id: USER, email: 'growth@test', passwordHash: 'x' },
        { id: OTHER, email: 'growth-other@test', passwordHash: 'x' },
      ],
    });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('分页快照：每页有上限，未了结任务先于已了结任务，归档任务及其 Subtask 不进快照', async () => {
    const { hub, log } = newHub();
    const activeProject = await testPrisma.project.create({
      data: { userId: USER, title: '进行中', status: 'ACTIVE' },
    });
    const total = BOOTSTRAP_PAGE_SIZE + 20;
    await testPrisma.task.createMany({
      data: Array.from({ length: total }, (_, index) => ({
        id: `open-${String(index).padStart(4, '0')}`,
        userId: USER,
        title: `任务 ${index}`,
      })),
    });
    await testPrisma.task.createMany({
      data: [
        { id: 'archived', userId: USER, title: '归档', status: 'COMPLETED', settledAt: OLD },
        { id: 'recent', userId: USER, title: '近期', status: 'COMPLETED', settledAt: RECENT },
        {
          id: 'in-project',
          userId: USER,
          title: '进行中项目的旧任务',
          status: 'CANCELLED',
          settledAt: OLD,
          projectId: activeProject.id,
        },
        {
          id: 'trashed',
          userId: USER,
          title: 'Trash 里的旧任务',
          status: 'COMPLETED',
          settledAt: OLD,
          trashedAt: OLD,
        },
        { id: 'no-settled-at', userId: USER, title: '没有了结时间', status: 'COMPLETED' },
        { id: 'others', userId: OTHER, title: '别人的' },
      ],
    });
    await testPrisma.subtask.createMany({
      data: [
        { id: 'sub-archived', taskId: 'archived', title: '归档的步骤' },
        { id: 'sub-recent', taskId: 'recent', title: '近期的步骤' },
      ],
    });
    await testPrisma.compactedEntity.create({
      data: { userId: USER, entity: 'task', entityId: 'gone' },
    });
    const fence = await log.currentSeq(USER);

    const pages = [];
    let page = await hub.bootstrapPage(USER, { settledAfter: CUTOFF });
    pages.push(page);
    // 翻页期间的写不改变 fence
    await hub.push(USER, [
      taskEvent('late', { title: '翻页时新建', createdAt: new Date().toISOString() }),
    ]);
    while (page.next) {
      page = await hub.bootstrapPage(USER, { page: page.next });
      pages.push(page);
    }
    for (const item of pages) {
      expect(item.snapshot.length).toBeLessThanOrEqual(BOOTSTRAP_PAGE_SIZE);
      expect(item.cursor).toBe(fence);
    }
    const entries = pages.flatMap((item) => item.snapshot);
    const taskIds = entries.filter((entry) => entry.entity === 'task').map((entry) => entry.id);
    expect(taskIds).not.toContain('archived');
    expect(taskIds).not.toContain('others');
    expect(taskIds).toEqual(
      expect.arrayContaining(['recent', 'in-project', 'trashed', 'no-settled-at']),
    );
    expect(taskIds).toHaveLength(total + 4);
    // 未了结任务在前
    expect(taskIds.indexOf('recent')).toBeGreaterThan(taskIds.indexOf(`open-${total - 1}`));
    expect(entries.filter((entry) => entry.entity === 'subtask').map((entry) => entry.id)).toEqual([
      'sub-recent',
    ]);
    expect(pages.at(-1)!.compacted).toEqual([{ entity: 'task', ids: ['gone'] }]);

    // 不带归档截止：全部都在
    let full = await hub.bootstrapPage(USER, {});
    const all = [...full.snapshot];
    while (full.next) {
      full = await hub.bootstrapPage(USER, { page: full.next });
      all.push(...full.snapshot);
    }
    expect(all.some((entry) => entry.id === 'archived')).toBe(true);
    expect(all.some((entry) => entry.id === 'sub-archived')).toBe(true);
  });

  it('无效的分页令牌得到 400', async () => {
    const { hub } = newHub();
    await expect(hub.bootstrapPage(USER, { page: 'not-a-token' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('真实引擎设备：分页 bootstrap 不拉归档；归档任务被改后回到副本并补齐 Subtask', async () => {
    const { hub, log } = newHub();
    await testPrisma.task.createMany({
      data: [
        { id: 'open', userId: USER, title: '未了结' },
        {
          id: 'archived',
          userId: USER,
          title: '归档',
          status: 'COMPLETED',
          settledAt: OLD,
          createdAt: OLD,
        },
      ],
    });
    await testPrisma.subtask.create({
      data: { id: 'sub-archived', taskId: 'archived', title: '步骤', status: 'COMPLETED' },
    });
    const device = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-growth',
      transport: transportFor(hub, log),
    });
    await device.sync();
    expect((await device.list('task')).map((row) => row.id)).toEqual(['open']);

    // 另一端（REST，虚拟设备 0）重开归档任务
    await hub.writeAsHub(USER, (batch) =>
      batch.write('task', 'archived', { status: 'ACTIVE', settledAt: null, bucket: 'INBOX' }),
    );
    await device.sync();
    expect((await device.get('task', 'archived'))?.fields.status).toBe('ACTIVE');
    expect((await device.list('subtask')).map((row) => row.id)).toEqual(['sub-archived']);
    await device.close();
  });

  it('按 id 取实体：带上级联的 Subtask，别人的与不存在的不返回', async () => {
    const { hub } = newHub();
    await testPrisma.task.createMany({
      data: [
        { id: 'mine', userId: USER, title: '我的' },
        { id: 'theirs', userId: OTHER, title: '别人的' },
      ],
    });
    await testPrisma.subtask.createMany({
      data: [
        { id: 'mine-sub', taskId: 'mine', title: '步骤' },
        { id: 'theirs-sub', taskId: 'theirs', title: '别人的步骤' },
      ],
    });
    const { entries } = await hub.fetchEntities(USER, 'task', ['mine', 'theirs', 'missing']);
    expect(entries.map((entry) => `${entry.entity}:${entry.id}`).sort()).toEqual([
      'subtask:mine-sub',
      'task:mine',
    ]);
    expect(entries[0].clocks).toBeDefined();
  });

  it('Compact 登记与它的 Compact Event 同期清理', async () => {
    const { hub, log } = newHub();
    await hub.push(USER, [
      taskEvent('old', { title: '早删', createdAt: new Date().toISOString() }),
      taskEvent('new', { title: '晚删', createdAt: new Date().toISOString() }),
    ]);
    await hub.push(USER, [], [{ entity: 'task', ids: ['old'] }]);
    const expired = new Date(Date.now() - (SYNC_LOG_RETENTION_DAYS + 1) * DAY);
    await testPrisma.compactedEntity.updateMany({
      where: { entityId: 'old' },
      data: { createdAt: expired },
    });
    await testPrisma.syncChange.updateMany({
      where: { userId: USER },
      data: { createdAt: expired },
    });
    await hub.push(USER, [], [{ entity: 'task', ids: ['new'] }]);
    await log.prune();

    const remaining = await testPrisma.compactedEntity.findMany({ where: { userId: USER } });
    expect(remaining.map((row) => row.entityId)).toEqual(['new']);
  });

  it('登记清理后：写给已删除行的局部写按 Compact 处理，不复活也不让 push 失败', async () => {
    const { hub, log } = newHub();
    const createdAt = new Date().toISOString();
    await hub.push(USER, [taskEvent('gone', { title: '将被删', createdAt })]);
    const cursor = await log.currentSeq(USER);
    await hub.push(USER, [], [{ entity: 'task', ids: ['gone'] }]);
    await testPrisma.compactedEntity.deleteMany({ where: { userId: USER } });

    await expect(
      hub.push(USER, [taskEvent('gone', { notes: '离线编辑' }, 1)]),
    ).resolves.toMatchObject({ acked: 1 });
    expect(await testPrisma.task.findUnique({ where: { id: 'gone' } })).toBeNull();
    const { changes } = await log.pull(USER, cursor);
    expect(changes.at(-1)).toMatchObject({ kind: 'compact', entity: 'task', ids: ['gone'] });
    expect(
      await testPrisma.compactedEntity.count({ where: { userId: USER, entityId: 'gone' } }),
    ).toBe(1);
  });

  it('登记清理后：引用早已删除的实体（不在本次 push 里）被清洗，而不是外键永远失败', async () => {
    const { hub } = newHub();
    await hub.push(USER, [
      taskEvent('task', { title: '任务', createdAt: new Date().toISOString() }),
    ]);
    // area-gone 从未在 hub 上（或删除后登记已清理）
    await expect(
      hub.push(USER, [taskEvent('task', { areaId: 'area-gone' }, 1)]),
    ).resolves.toMatchObject({ acked: 1 });
    expect((await testPrisma.task.findUnique({ where: { id: 'task' } }))?.areaId).toBeNull();
  });

  it('Logbook 归档：按了结时间倒序分页，只含归档任务', async () => {
    const feed = new FeedService(prisma, undefined as never);
    await testPrisma.task.createMany({
      data: [
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `archived-${index}`,
          userId: USER,
          title: `归档 ${index}`,
          status: 'COMPLETED' as const,
          settledAt: new Date(OLD.getTime() - index * DAY),
        })),
        // 与 archived-1 同一了结时刻：按 id 升序（与本地 Logbook 排序一致）
        {
          id: 'archived-1b',
          userId: USER,
          title: '同刻归档',
          status: 'CANCELLED',
          settledAt: new Date(OLD.getTime() - DAY),
        },
        { id: 'recent', userId: USER, title: '近期', status: 'COMPLETED', settledAt: RECENT },
        { id: 'others', userId: OTHER, title: '别人的', status: 'COMPLETED', settledAt: OLD },
      ],
    });
    const seen: string[] = [];
    let page = await feed.logbookArchive(USER, new Date(CUTOFF), undefined, 2);
    seen.push(...page.items.map((item) => item.id));
    while (page.next) {
      page = await feed.logbookArchive(USER, new Date(CUTOFF), page.next, 2);
      seen.push(...page.items.map((item) => item.id));
    }
    expect(seen).toEqual([
      'archived-0',
      'archived-1',
      'archived-1b',
      'archived-2',
      'archived-3',
      'archived-4',
    ]);
  });
});
