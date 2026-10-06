/**
 * REST 写路径的真库测试夹具（local-first-v3 issue 05）。
 *
 * REST 服务的写经 SyncHubService.writeAsHub 走合并器：锁、合并、变更
 * 日志都在 Postgres 事务里，mock Prisma 验证不了这些，所以写路径的
 * 服务测试一律用真库。无 TEST_DATABASE_URL 时整组跳过。
 */
import { describe, expect } from 'vitest';

import type { HubChange } from '@taskora/engine';

import { AreasService } from '../src/areas/areas.service';
import { FeedService } from '../src/feed/feed.service';
import { ProjectHeadingsService } from '../src/project-headings/project-headings.service';
import { ProjectsService } from '../src/projects/projects.service';
import { SubtasksService } from '../src/subtasks/subtasks.service';
import { codecFor, loadRow, serializeRow } from '../src/sync/entity-codec';
import { PrismaSyncChangeLog } from '../src/sync/prisma-sync-change-log.service';
import { SyncHubService } from '../src/sync/sync-hub.service';
import { TagsService } from '../src/tags/tags.service';
import { TasksService } from '../src/tasks/tasks.service';
import { resetDb, testPrisma, testPrismaService } from './db';

export const dbDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

export const USER = 'user-rest';
export const OTHER_USER = 'user-other';

export async function createHarness(timeZone = 'UTC') {
  await resetDb();
  await testPrisma.user.create({
    data: { id: USER, email: 'rest@test', passwordHash: 'x', preferences: { timeZone } },
  });
  await testPrisma.user.create({
    data: { id: OTHER_USER, email: 'other@test', passwordHash: 'x' },
  });
  const prisma = testPrismaService();
  const log = new PrismaSyncChangeLog(prisma);
  const hub = new SyncHubService(prisma, log);
  return {
    prisma: testPrisma,
    log,
    hub,
    tasks: new TasksService(prisma, hub),
    subtasks: new SubtasksService(prisma, hub),
    projects: new ProjectsService(prisma, hub),
    headings: new ProjectHeadingsService(prisma, hub),
    areas: new AreasService(prisma, hub),
    tags: new TagsService(prisma, hub),
    feed: new FeedService(prisma, hub),
  };
}

/** 该用户变更日志里的全部变更（seq 升序）。 */
export async function loggedChanges(userId = USER): Promise<HubChange[]> {
  const rows = await testPrisma.syncChange.findMany({
    where: { userId },
    orderBy: { seq: 'asc' },
  });
  return rows.map((row) => ({ ...(row.payload as object), seq: Number(row.seq) }) as HubChange);
}

/** 日志里某实体最后一次的实体变更。 */
export async function lastLoggedState(entity: string, id: string) {
  const changes = await loggedChanges();
  const entries = changes.filter(
    (change) => change.kind === 'entity' && change.entity === entity && change.id === id,
  );
  return entries.at(-1) as Extract<HubChange, { kind: 'entity' }> | undefined;
}

/**
 * 行的当前合并态与日志里最后一条记录逐字段一致——REST 写与日志同事务、
 * 设备 pull 到的就是落库的状态。
 */
export async function expectLoggedAsStored(
  entity: Parameters<typeof codecFor>[0],
  id: string,
): Promise<void> {
  const row = await loadRow(testPrisma, codecFor(entity), id);
  expect(row).not.toBeNull();
  const state = serializeRow(codecFor(entity), row!);
  const logged = await lastLoggedState(entity, id);
  expect(logged?.fields).toEqual(state.fields);
  expect(logged?.clocks).toEqual(state.clocks);
}

/** 日志里某实体的 Compact Event 覆盖的 id。 */
export async function compactedIdsInLog(entity: string): Promise<string[]> {
  return (await loggedChanges())
    .filter((change) => change.kind === 'compact' && change.entity === entity)
    .flatMap((change) => (change as Extract<HubChange, { kind: 'compact' }>).ids);
}

export async function registeredCompacted(entity: string): Promise<string[]> {
  const rows = await testPrisma.compactedEntity.findMany({
    where: { userId: USER, entity },
    select: { entityId: true },
  });
  return rows.map((row) => row.entityId).sort();
}
