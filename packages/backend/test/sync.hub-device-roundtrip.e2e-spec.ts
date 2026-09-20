/**
 * Sync Hub 设备往返回归（真实 Postgres）。
 *
 * 回归背景（v0.4.2「今天界面创建任务，同步后变 Inbox」）：
 * 1. 设备 push 全字段 create（含 tagIds）曾在 hub 被 Prisma 拒掉——
 *    create 路径的 tagIds 物化携带 deleteMany，触发 checked 输入校验；
 * 2. 后续部分字段 update 落在不存在的行为上、被当成 create 建行，
 *    缺失字段吃 Prisma 默认值（bucket=INBOX、scheduledType=NONE）；
 * 3. 该默认值行以晚于设备原始写的基线时钟广播回设备，把 Today
 *    合并态改写成 Inbox。
 *
 * 本 spec 用真实 Prisma + 真实 SyncHubService 固化完整往返语义。
 * 无 TEST_DATABASE_URL 时整组跳过（与其它 e2e 同惯例）。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { formatHlc, mergeEntityState, type EntityMergeState } from '@taskora/engine';

import { PrismaService } from '../src/prisma/prisma.service';
import { SyncEventBuffer } from '../src/sync/sync-event-buffer.service';
import { SyncHubService } from '../src/sync/sync-hub.service';
import { disconnectTestDb, resetDb, testPrisma } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;

const e2eDescribe = hasTestDb ? describe : describe.skip;

const USER = 'user-sync-e2e';
const WALL = 1_800_000_000_000;

const stamp = (counter: number) => formatHlc({ wallMs: WALL, counter, deviceId: 'dev-e2e' });

e2eDescribe('SyncHubService 设备往返（真实 Postgres）', () => {
  let hub: SyncHubService;
  let buffer: SyncEventBuffer;

  beforeEach(async () => {
    await resetDb();
    await testPrisma.user.create({
      data: { id: USER, email: 'sync-e2e@test', passwordHash: 'x' },
    });
    buffer = new SyncEventBuffer();
    hub = new SyncHubService(testPrisma as unknown as PrismaService, buffer, undefined as never);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  /** 与 LocalReplica.createInternal 一致的全字段 create 事件（tagIds=[]）。 */
  function fullCreateEvent(id: string, overrides: Record<string, unknown> = {}) {
    const fields: Record<string, unknown> = {
      title: '',
      notes: null,
      scheduledDate: new Date().toISOString(),
      dueDate: null,
      bucket: 'SCHEDULED',
      scheduledType: 'DATE',
      status: 'ACTIVE',
      settledAt: null,
      trashedAt: null,
      position: 'a0',
      sortOrder: null,
      projectId: null,
      headingId: null,
      areaId: null,
      tagIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
    return {
      entity: 'task' as const,
      id,
      fields: Object.fromEntries(
        Object.entries(fields).map(([name, value], i) => [name, { value, hlc: stamp(i) }]),
      ),
    };
  }

  it('设备全字段 create 落库并保留 Today 语义（不再被 Prisma 拒掉）', async () => {
    await hub.push(USER, [fullCreateEvent('task-today-1')]);

    const row = await testPrisma.task.findUnique({ where: { id: 'task-today-1' } });
    expect(row).not.toBeNull();
    expect(row!.bucket).toBe('SCHEDULED');
    expect(row!.scheduledType).toBe('DATE');
    expect(row!.scheduledDate).not.toBeNull();
  });

  it('回归：Today 创建 → 后续 title 编辑 → pull 合并后仍在 Today（不落 Inbox）', async () => {
    const cursorBefore = buffer.currentSeq(USER);

    // 1. Today 界面创建（空标题，全字段）
    const created = fullCreateEvent('task-today-2');
    await hub.push(USER, [created]);

    // 2. 用户在新行输入标题 → 部分字段 update（不含 tagIds）
    await hub.push(USER, [
      {
        entity: 'task',
        id: 'task-today-2',
        fields: {
          title: { value: '今天要做的任务', hlc: stamp(50) },
          updatedAt: { value: new Date().toISOString(), hlc: stamp(51) },
        },
      },
    ]);

    // hub 行保持 Today 语义
    const row = await testPrisma.task.findUnique({ where: { id: 'task-today-2' } });
    expect(row).toMatchObject({
      title: '今天要做的任务',
      bucket: 'SCHEDULED',
      scheduledType: 'DATE',
    });

    // 3. 设备 pull 增量并合并（模拟 LocalReplica.applyRemoteEntity）
    let deviceState: EntityMergeState | null = null;
    {
      const incoming = Object.fromEntries(
        Object.entries(created.fields).map(([name, w]) => [
          name,
          { value: (w as { value: unknown }).value, hlc: (w as { hlc: string }).hlc },
        ]),
      );
      deviceState = mergeEntityState(null, {
        fields: Object.fromEntries(
          Object.entries(incoming).map(([n, w]) => [n, (w as { value: unknown }).value]),
        ),
        clocks: Object.fromEntries(
          Object.entries(incoming).map(([n, w]) => [n, (w as { hlc: string }).hlc]),
        ),
      });
    }

    const { changes, resync } = buffer.pull(USER, cursorBefore);
    expect(resync).toBe(false);
    const entityChanges = changes.filter((c) => c.kind === 'entity' && c.id === 'task-today-2');
    expect(entityChanges.length).toBeGreaterThan(0);

    for (const change of entityChanges) {
      if (change.kind !== 'entity') continue;
      deviceState = mergeEntityState(deviceState, {
        fields: change.fields,
        clocks: change.clocks,
      });
    }

    // 同步后设备合并态：仍在 Today，绝不落 Inbox
    const f = deviceState!.fields;
    expect(f.title).toBe('今天要做的任务');
    expect(f.scheduledType).toBe('DATE');
    expect(f.scheduledDate).toBeTruthy();
    expect(f.bucket).toBe('SCHEDULED');
    expect(f.bucket).not.toBe('INBOX');
  });

  it('带 tagIds 的 create：关系物化为纯 create 且标签落库', async () => {
    await testPrisma.tag.create({
      data: { id: 'tag-1', title: '标签', userId: USER },
    });

    await hub.push(USER, [fullCreateEvent('task-tagged-1', { tagIds: ['tag-1'] })]);

    const row = await testPrisma.task.findUnique({
      where: { id: 'task-tagged-1' },
      include: { tags: true },
    });
    expect(row).not.toBeNull();
    expect(row!.tags.map((t) => t.tagId)).toEqual(['tag-1']);
  });

  it('回归：越权字段写被拒——他人实体不可改写、不进自己的增量流', async () => {
    const attacker = await testPrisma.user.create({
      data: { email: 'attacker@test', passwordHash: 'x' },
    });

    // 受害者的任务（正常同步路径创建）
    await hub.push(USER, [fullCreateEvent('task-victim-1')]);
    const before = await testPrisma.task.findUnique({ where: { id: 'task-victim-1' } });
    expect(before).not.toBeNull();

    // 攻击者对该 id 推送字段写
    const cursorBefore = buffer.currentSeq(attacker.id);
    await hub.push(attacker.id, [
      {
        entity: 'task',
        id: 'task-victim-1',
        fields: {
          title: { value: '篡改', hlc: stamp(90) },
        },
      },
    ]);

    // 数据未被改写
    const after = await testPrisma.task.findUnique({ where: { id: 'task-victim-1' } });
    expect(after!.title).toBe(before!.title);

    // 攻击者的增量流里没有他人实体（无数据泄露）
    const pulled = buffer.pull(attacker.id, cursorBefore);
    expect(pulled.resync).toBe(false);
    expect(pulled.changes).toHaveLength(0);
  });
});
