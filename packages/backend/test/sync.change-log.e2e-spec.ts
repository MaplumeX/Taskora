/**
 * 持久化同步变更日志（真实 Postgres）：hub 重启后的增量追平、旧世代
 * cursor 的 resync、分页、30 天保留期清理、并发写入的 seq 连续性。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { formatHlc, openEngine, type OutboxEvent, type SyncTransport } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';

import { PrismaSyncChangeLog } from '../src/sync/prisma-sync-change-log.service';
import { SYNC_LOG_RETENTION_DAYS, SYNC_PULL_PAGE_SIZE } from '../src/sync/sync-change-log';
import { SyncHubService } from '../src/sync/sync-hub.service';
import { disconnectTestDb, resetDb, testPrisma, testPrismaService } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;
const e2eDescribe = hasTestDb ? describe : describe.skip;

const USER = 'user-sync-log';
const prisma = testPrismaService();

function newHub() {
  const log = new PrismaSyncChangeLog(prisma);
  return { log, hub: new SyncHubService(prisma, log) };
}

function areaEvent(id: string, counter: number): OutboxEvent {
  const hlc = formatHlc({ wallMs: Date.now(), counter, deviceId: 'dev-log' });
  const now = new Date().toISOString();
  return {
    entity: 'area',
    id,
    fields: {
      title: { value: id, hlc },
      sortOrder: { value: 0, hlc },
      tagIds: { value: [], hlc },
      createdAt: { value: now, hlc },
      updatedAt: { value: now, hlc },
    },
  };
}

e2eDescribe('PrismaSyncChangeLog（真实 Postgres）', () => {
  beforeEach(async () => {
    await resetDb();
    await testPrisma.user.create({
      data: { id: USER, email: 'sync-log@test', passwordHash: 'x' },
    });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('hub 重启后，持旧 cursor 的设备增量追平而不是全量重建', async () => {
    const before = newHub();
    const cursor = await before.log.currentSeq(USER);
    await before.hub.push(USER, [areaEvent('area-1', 0)]);

    // 进程重启：全新的服务实例，日志只在数据库里
    const after = newHub();
    const pulled = await after.hub.pull(USER, cursor);
    expect(pulled.resync).toBe(false);
    expect(pulled.changes.map((change) => change.kind === 'entity' && change.id)).toEqual([
      'area-1',
    ]);
  });

  it('cursor 0（从未 bootstrap）与旧内存缓冲世代的 cursor 都走 resync', async () => {
    const { hub } = newHub();
    await hub.push(USER, [areaEvent('area-1', 0)]);
    expect((await hub.pull(USER, 0)).resync).toBe(true);
    expect((await hub.pull(USER, Date.now())).resync).toBe(true);
    // bootstrap 给出的 cursor 之后可以正常增量
    const { cursor } = await hub.bootstrap(USER);
    expect((await hub.pull(USER, cursor)).resync).toBe(false);
  });

  it('超过一页时 hasMore，真实引擎设备循环拉取直到追平', async () => {
    const { hub, log } = newHub();
    const transport: SyncTransport = {
      push: (request) => hub.push(USER, request.events, request.deletes),
      pull: (request) => hub.pull(USER, request.cursor),
      bootstrap: () => hub.bootstrap(USER),
    };
    const device = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-page',
      transport,
    });
    await device.sync();

    const total = SYNC_PULL_PAGE_SIZE + 50;
    const cursor = await log.currentSeq(USER);
    await log.append(
      testPrisma,
      USER,
      Array.from({ length: total }, (_, index) => ({
        kind: 'compact' as const,
        entity: 'task' as const,
        ids: [`gone-${index}`],
      })),
    );
    const firstPage = await hub.pull(USER, cursor);
    expect(firstPage.changes).toHaveLength(SYNC_PULL_PAGE_SIZE);
    expect(firstPage.hasMore).toBe(true);

    await device.pull();
    expect(await device.cursor()).toBe(await log.currentSeq(USER));
    expect(await device.isCompacted('task', `gone-${total - 1}`)).toBe(true);
    await device.close();
  });

  it('保留期清理：过期日志删除，早于清理点的 cursor 走 resync', async () => {
    const { hub, log } = newHub();
    const staleCursor = await log.currentSeq(USER);
    await hub.push(USER, [areaEvent('area-old', 0)]);
    const freshCursor = await log.currentSeq(USER);
    await hub.push(USER, [areaEvent('area-new', 1)]);

    // 把第一条日志挪到保留期之外
    const expired = new Date(Date.now() - (SYNC_LOG_RETENTION_DAYS + 1) * 24 * 3600 * 1000);
    await testPrisma.syncChange.updateMany({
      where: { userId: USER, seq: { lte: freshCursor } },
      data: { createdAt: expired },
    });
    await log.prune();

    expect(await testPrisma.syncChange.count({ where: { userId: USER } })).toBe(1);
    expect((await hub.pull(USER, staleCursor)).resync).toBe(true);
    const fresh = await hub.pull(USER, freshCursor);
    expect(fresh.resync).toBe(false);
    expect(fresh.changes.map((change) => change.kind === 'entity' && change.id)).toEqual([
      'area-new',
    ]);
  });

  it('并发写入：seq 连续无缺口，每条提交的变更都能被拉到', async () => {
    const { hub, log } = newHub();
    const cursor = await log.currentSeq(USER);
    const count = 40;
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        hub.push(USER, [areaEvent(`area-${index}`, index)]),
      ),
    );
    const pulled = await hub.pull(USER, cursor);
    const seqs = pulled.changes.map((change) => change.seq);
    expect(seqs).toEqual(Array.from({ length: count }, (_, index) => cursor + 1 + index));
    const ids = new Set(pulled.changes.map((change) => change.kind === 'entity' && change.id));
    expect(ids.size).toBe(count);
  });
});
