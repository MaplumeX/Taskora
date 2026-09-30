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

import {
  formatHlc,
  HybridClock,
  mergeEntityState,
  openEngine,
  type EntityMergeState,
  type SyncTransport,
} from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';

import { PrismaSyncChangeLog } from '../src/sync/prisma-sync-change-log.service';
import { SyncHubService } from '../src/sync/sync-hub.service';
import { materializeLegacyClocks } from '../src/sync/legacy-clock-backfill';
import { disconnectTestDb, resetDb, testPrisma, testPrismaService } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;

const e2eDescribe = hasTestDb ? describe : describe.skip;

const USER = 'user-sync-e2e';
const WALL = 1_800_000_000_000;

const stamp = (counter: number) => formatHlc({ wallMs: WALL, counter, deviceId: 'dev-e2e' });

e2eDescribe('SyncHubService 设备往返（真实 Postgres）', () => {
  let hub: SyncHubService;
  let buffer: PrismaSyncChangeLog;

  beforeEach(async () => {
    await resetDb();
    await testPrisma.user.create({
      data: { id: USER, email: 'sync-e2e@test', passwordHash: 'x' },
    });
    buffer = new PrismaSyncChangeLog(testPrismaService());
    hub = new SyncHubService(testPrismaService(), buffer);
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
      reminderTime: null,
      repeatRule: null,
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

  function fullTagCreateEvent(id: string) {
    const fields: Record<string, unknown> = {
      title: '稍后创建的标签',
      color: '#3B82F6',
      position: 'a0',
      sortOrder: 0,
      tagGroupId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return {
      entity: 'tag' as const,
      id,
      fields: Object.fromEntries(
        Object.entries(fields).map(([name, value], i) => [name, { value, hlc: stamp(100 + i) }]),
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
    const cursorBefore = await buffer.currentSeq(USER);

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
    let deviceState: EntityMergeState;
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

    const { changes, resync } = await buffer.pull(USER, cursorBefore);
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

  it('批内前序依赖失败时不确认 Outbox；后序父实体落库后重试可收敛', async () => {
    const task = fullCreateEvent('task-retry-1', { tagIds: ['tag-late-1'] });
    const tag = fullTagCreateEvent('tag-late-1');

    // 第一轮 Task 在 Tag 之前，关系写失败；Hub 仍继续创建后面的 Tag，
    // 但整体请求失败，使设备保留整批。
    await expect(hub.push(USER, [task, tag])).rejects.toBeTruthy();
    expect(await testPrisma.tag.findUnique({ where: { id: 'tag-late-1' } })).not.toBeNull();
    expect(await testPrisma.task.findUnique({ where: { id: 'task-retry-1' } })).toBeNull();

    // 第二轮幂等重放：Tag 已存在，Task 关系可以正常物化。
    await hub.push(USER, [task, tag]);
    const row = await testPrisma.task.findUnique({
      where: { id: 'task-retry-1' },
      include: { tags: true },
    });
    expect(row?.tags.map((entry) => entry.tagId)).toEqual(['tag-late-1']);
  });

  it('并发修改同一字段时严格按 HLC 决胜，而不是按数据库提交顺序', async () => {
    await hub.push(USER, [fullCreateEvent('task-concurrent-1', { title: '初始' })]);
    const newer = formatHlc({ wallMs: WALL + 2, counter: 0, deviceId: 'dev-newer' });
    const older = formatHlc({ wallMs: WALL + 1, counter: 0, deviceId: 'dev-older' });

    // 故意先启动新写、后启动旧写；没有事务实体锁时，旧写可能最后提交并覆盖。
    await Promise.all([
      hub.push(USER, [
        {
          entity: 'task',
          id: 'task-concurrent-1',
          fields: { title: { value: 'HLC 新写', hlc: newer } },
        },
      ]),
      hub.push(USER, [
        {
          entity: 'task',
          id: 'task-concurrent-1',
          fields: { title: { value: 'HLC 旧写', hlc: older } },
        },
      ]),
    ]);

    const row = await testPrisma.task.findUnique({ where: { id: 'task-concurrent-1' } });
    expect(row?.title).toBe('HLC 新写');
    expect((row?.fieldClocks as Record<string, string>).title).toBe(newer);
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
    const cursorBefore = await buffer.currentSeq(attacker.id);
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
    const pulled = await buffer.pull(attacker.id, cursorBefore);
    expect(pulled.resync).toBe(false);
    expect(pulled.changes).toHaveLength(0);
  });

  it('回声幂等：设备 pull 自己 push 的变更，任何字段都不被当作远端写', async () => {
    const cursorBefore = await buffer.currentSeq(USER);

    // 1. 全字段 create（与 LocalReplica.createInternal 同构）
    const created = fullCreateEvent('task-echo-1');
    await hub.push(USER, [created]);

    // 设备本地合并态 = 自己刚写的内容
    let deviceState = mergeEntityState(null, {
      fields: Object.fromEntries(
        Object.entries(created.fields).map(([n, w]) => [n, (w as { value: unknown }).value]),
      ),
      clocks: Object.fromEntries(
        Object.entries(created.fields).map(([n, w]) => [n, (w as { hlc: string }).hlc]),
      ),
    });

    // 2. 部分字段编辑（title + 自动推进的 updatedAt）——设备本地已先应用，
    // 再 push 给 hub
    const edit = {
      title: { value: '回声测试的编辑' as unknown, hlc: stamp(200) },
      updatedAt: { value: new Date().toISOString() as unknown, hlc: stamp(201) },
    };
    deviceState = mergeEntityState(deviceState, {
      fields: { title: edit.title.value, updatedAt: edit.updatedAt.value },
      clocks: { title: edit.title.hlc, updatedAt: edit.updatedAt.hlc },
    });
    await hub.push(USER, [{ entity: 'task', id: 'task-echo-1', fields: edit }]);

    // 3. pull 自己的两次回声并逐条合并
    const { changes, resync } = await buffer.pull(USER, cursorBefore);
    expect(resync).toBe(false);
    const echoes = changes.filter((c) => c.kind === 'entity' && c.id === 'task-echo-1');
    expect(echoes.length).toBeGreaterThan(0);

    for (const change of echoes) {
      if (change.kind !== 'entity') continue;
      const outcome = mergeEntityState(deviceState, {
        fields: change.fields,
        clocks: change.clocks,
      });
      // 回声不得改写设备本地任何字段（时钟全部持平或更旧 → 零应用）。
      // 否则回声被设备应用并触发 onChange → 全域失效 → 界面「同步后
      // 刷新一下」。hub 存下的时钟即权威（不再有摘要检测），列值与推送
      // 值的格式差异（日期、tagIds 排序、不可空列默认值）不影响时钟。
      expect(outcome.appliedFields).toEqual([]);
      deviceState = { fields: outcome.fields, clocks: outcome.clocks };
    }
  });

  it('同步毒丸防御：离线写引用已删 tag，hub 清洗后 push 不再反复失败且两端收敛', async () => {
    // 初始：任务携带 tag-1，同步落库
    await testPrisma.tag.create({ data: { id: 'tag-keep', title: '保留', userId: USER } });
    await testPrisma.tag.create({ data: { id: 'tag-doom', title: '将删', userId: USER } });
    await hub.push(USER, [fullCreateEvent('task-pill-1', { tagIds: ['tag-keep', 'tag-doom'] })]);
    const row = await testPrisma.task.findUnique({
      where: { id: 'task-pill-1' },
      include: { tags: true },
    });
    expect(row!.tags.map((t) => t.tagId).sort()).toEqual(['tag-doom', 'tag-keep']);

    // 离线窗口：hub 侧删除 tag-doom（登记 + 物理删除），设备毫不知情
    await testPrisma.compactedEntity.create({
      data: { userId: USER, entity: 'tag', entityId: 'tag-doom' },
    });
    await testPrisma.tag.delete({ where: { id: 'tag-doom' } });

    // 设备恢复联网：携带失效引用的写必须被清洗而非 FK 拒绝（回归前：
    // TaskTag 物化触发 FK violation，push 永远失败，Outbox 卡死）
    const event = fullCreateEvent('task-pill-1', {});
    const edited = {
      tagIds: { value: ['tag-keep', 'tag-doom'], hlc: stamp(300) },
      title: { value: '离线改名', hlc: stamp(301) },
    };
    void event;
    const cursorBefore = await buffer.currentSeq(USER);
    await expect(
      hub.push(USER, [{ entity: 'task', id: 'task-pill-1', fields: edited }]),
    ).resolves.toEqual({ acked: 1 });

    const after = await testPrisma.task.findUnique({
      where: { id: 'task-pill-1' },
      include: { tags: true },
    });
    expect(after!.tags.map((t) => t.tagId)).toEqual(['tag-keep']);
    expect(after!.title).toBe('离线改名');

    // 设备 pull 回声后本地收敛（清洗值以虚拟设备 0 的更新时钟胜出）
    // cursor 必须取自推送前：pull(USER, 0) 会被缓冲判为 resync，返回空变更
    const pull = await buffer.pull(USER, cursorBefore);
    const echo = pull.changes.find(
      (change) =>
        change.kind === 'entity' && change.id === 'task-pill-1' && 'tagIds' in change.fields,
    ) as ((typeof pull.changes)[number] & { fields: Record<string, unknown> }) | undefined;
    expect(echo).toBeDefined();
    expect(echo!.fields.tagIds).toEqual(['tag-keep']);
  });

  it('真实引擎设备：离线积压超过一批且含前向引用时，推送不会被 FK 永久卡死', async () => {
    const transport: SyncTransport = {
      push: (request) => hub.push(USER, request.events, request.deletes),
      pull: async (request) => await buffer.pull(USER, request.cursor),
      bootstrap: () => hub.bootstrap(USER),
    };
    const device = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-real',
      transport,
    });
    await device.sync();

    const base = { bucket: 'INBOX', status: 'ACTIVE', scheduledType: 'NONE' };
    const early = await device.create('task', { title: '早建的任务', ...base });
    for (let index = 0; index < 600; index += 1) {
      await device.create('task', { title: `填充 ${index}`, ...base });
    }
    const area = await device.create('area', { title: '晚建的区域' });
    // 旧实现把这条写合并进 early 的第 1 行 → 与 area 的创建不同批 → Postgres
    // 外键永远失败，Outbox 永久卡死
    await device.update('task', early, { areaId: area });

    await device.sync();
    expect(await device.pendingCount()).toBe(0);
    const row = await testPrisma.task.findUnique({ where: { id: early } });
    expect(row?.areaId).toBe(area);
    expect(await testPrisma.task.count({ where: { userId: USER } })).toBe(601);
    await device.close();
  }, 120_000);

  it('hub 剔除的字段值（未知枚举等）以必胜时钟下发实际值，推送方收敛不分叉', async () => {
    const transport: SyncTransport = {
      push: (request) => hub.push(USER, request.events, request.deletes),
      pull: (request) => buffer.pull(USER, request.cursor),
      bootstrap: () => hub.bootstrap(USER),
    };
    const open = async (deviceId: string) =>
      openEngine({ storage: await createNodeSqliteStorage(':memory:'), deviceId, transport });
    const a = await open('dev-a');
    const b = await open('dev-b');
    await a.sync();
    await b.sync();
    const id = await a.create('task', {
      title: 't',
      bucket: 'INBOX',
      status: 'ACTIVE',
      scheduledType: 'NONE',
    });
    await a.sync();

    // 正常写的回声：零应用、零通知（纠正只针对被剔除的字段）
    const remoteOnA: string[] = [];
    const off = a.onChange((change) => {
      if (change.origin === 'remote') remoteOnA.push('remote');
    });
    await a.update('task', id, { title: '正常改名', dueDate: '2026-10-01' });
    await a.sync();
    expect(remoteOnA).toEqual([]);
    off();

    // 新版客户端写出服务器不认识的状态值；同批的合法字段照常生效
    await a.update('task', id, { status: 'SNOOZED', title: 't2' });
    await a.sync();
    await a.sync();
    await b.sync();

    const hubRow = await testPrisma.task.findUnique({ where: { id } });
    expect(hubRow?.status).toBe('ACTIVE');
    expect((await a.get('task', id))?.fields.status).toBe('ACTIVE');
    expect((await b.get('task', id))?.fields.status).toBe('ACTIVE');
    expect((await a.get('task', id))?.fields.title).toBe('t2');
    expect((await b.get('task', id))?.fields.title).toBe('t2');
    await a.close();
    await b.close();
  });

  it('并发编辑合并出违反业务规则的组合时，hub 纠正并让两台设备收敛', async () => {
    const transport: SyncTransport = {
      push: (request) => hub.push(USER, request.events, request.deletes),
      pull: (request) => buffer.pull(USER, request.cursor),
      bootstrap: () => hub.bootstrap(USER),
    };
    const a = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-a',
      transport,
    });
    // B 的系统时钟快 1 分钟（在漂移上限内）：它的编辑在 LWW 中胜出
    const b = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-b',
      transport,
      clock: new HybridClock('dev-b', () => Date.now() + 60_000),
    });
    await a.sync();
    const p1 = await a.create('project', { title: 'P1', status: 'ACTIVE', bucket: 'ANYTIME' });
    const p2 = await a.create('project', { title: 'P2', status: 'ACTIVE', bucket: 'ANYTIME' });
    const h1 = await a.create('project-heading', { title: 'H1', projectId: p1, status: 'ACTIVE' });
    const moved = await a.create('task', {
      title: 'moved',
      status: 'ACTIVE',
      scheduledType: 'NONE',
      bucket: 'ANYTIME',
      projectId: p1,
    });
    const someday = await a.create('task', {
      title: 'someday',
      status: 'ACTIVE',
      scheduledType: 'DATE',
      scheduledDate: '2026-10-01',
      bucket: 'SCHEDULED',
    });
    await a.sync();
    await b.sync();

    // 各自离线编辑（本地写，暂不推送）
    await a.update('task', moved, { projectId: p2, headingId: null });
    await a.update('task', someday, {
      scheduledType: 'SOMEDAY',
      scheduledDate: null,
      reminderTime: null,
      repeatRule: null,
    });
    await b.update('task', moved, { headingId: h1 });
    await b.update('task', someday, { reminderTime: '09:00' });
    await a.sync();
    await b.sync();
    await a.sync();

    for (const device of [a, b]) {
      const task = (await device.get('task', moved))!.fields;
      expect(task.projectId).toBe(p2);
      expect(task.headingId).toBeNull();
      const other = (await device.get('task', someday))!.fields;
      expect(other.scheduledType).toBe('SOMEDAY');
      expect(other.reminderTime).toBeNull();
    }
    const rows = await testPrisma.task.findMany({ where: { id: { in: [moved, someday] } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(moved)?.headingId).toBeNull();
    expect(byId.get(someday)?.reminderTime).toBeNull();
    await a.close();
    await b.close();
  });

  it('启动物化旧摘要：REST 改过的字段取基线、其余沿用设备时钟；清空摘要，不改 updatedAt、不入日志', async () => {
    const deviceStamp = formatHlc({ wallMs: WALL, counter: 1, deviceId: 'dev-e2e' });
    const updatedAt = new Date('2026-05-01T00:00:00Z');
    await testPrisma.task.create({
      data: {
        id: 'task-legacy',
        userId: USER,
        title: 'REST 改过的标题',
        notes: '设备写的备注',
        updatedAt,
        fieldClocks: { title: deviceStamp, notes: deviceStamp },
        fieldDigests: { title: JSON.stringify('旧标题'), notes: JSON.stringify('设备写的备注') },
      },
    });
    const seqBefore = await buffer.currentSeq(USER);

    expect(await materializeLegacyClocks(testPrismaService())).toBe(1);

    const row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-legacy' } });
    const clocks = row.fieldClocks as Record<string, string>;
    const baseline = formatHlc({ wallMs: updatedAt.getTime(), counter: 0, deviceId: '0' });
    expect(clocks.title).toBe(baseline);
    expect(clocks.notes).toBe(deviceStamp);
    expect(clocks.bucket).toBe(baseline);
    expect(row.fieldDigests).toBeNull();
    expect(row.updatedAt).toEqual(updatedAt);
    expect(await buffer.currentSeq(USER)).toBe(seqBefore);
    // 幂等：再跑一次没有可物化的行
    expect(await materializeLegacyClocks(testPrismaService())).toBe(0);
  });
});
