/**
 * TasksService 写路径（真实 Postgres + 真实 Sync Hub，local-first-v3 issue 05）。
 *
 * 领域规则本身在 engine 的 domain 测试与三方契约测试里覆盖；这里验证
 * REST 写经合并器落库：字段值、变更日志与数据同事务、虚拟设备 0 的
 * 时钟语义、多行操作的原子性。
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeEach, expect, it } from 'vitest';

import {
  deriveRepeatInstanceId,
  deriveSubtaskId,
  effectivePosition,
  formatHlc,
  hlcWallMs,
  synthPosition,
  type RepeatRule,
} from '@taskora/engine';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { disconnectTestDb, testPrisma } from './db';
import {
  compactedIdsInLog,
  createHarness,
  dbDescribe,
  expectLoggedAsStored,
  lastLoggedState,
  loggedChanges,
  OTHER_USER,
  registeredCompacted,
  USER,
} from './rest-writes.harness';

type Harness = Awaited<ReturnType<typeof createHarness>>;

const dailyRule: RepeatRule = { unit: 'day', interval: 1, anchor: 'scheduled' };
const dailyRuleJson = JSON.stringify(dailyRule);

async function seedTask(id: string, data: Record<string, unknown> = {}, userId = USER) {
  return testPrisma.task.create({
    data: {
      id,
      userId,
      title: '任务',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...data,
    } as never,
  });
}

async function seedTag(id: string, userId = USER) {
  return testPrisma.tag.create({ data: { id, userId, title: id } });
}

dbDescribe('TasksService 写路径（真实 Postgres）', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // ---------- create ----------

  it('create：全部领域字段落库，与日志同事务；位次口径 sortOrder 0 + 合成 Position', async () => {
    await seedTag('tag-a');
    await seedTag('tag-b');
    const dto = await h.tasks.create(USER, {
      title: '写周报',
      areaId: undefined,
      tagIds: ['tag-b', 'tag-a'],
    });

    const row = await testPrisma.task.findUniqueOrThrow({
      where: { id: dto.id },
      include: { tags: true },
    });
    expect(row).toMatchObject({
      title: '写周报',
      userId: USER,
      bucket: TaskBucket.INBOX,
      scheduledType: ScheduledType.NONE,
      status: TaskStatus.ACTIVE,
      sortOrder: 0,
      position: synthPosition(0, row.createdAt),
    });
    expect(row.tags.map((tt) => tt.tagId).sort()).toEqual(['tag-a', 'tag-b']);
    expect(dto.tags.map((tag) => tag.id).sort()).toEqual(['tag-a', 'tag-b']);
    await expectLoggedAsStored('task', dto.id);
    // 每个字段都有虚拟设备 0 的真实时钟（不再靠摘要推断）
    const logged = await lastLoggedState('task', dto.id);
    expect(Object.values(logged!.clocks).every((hlc) => hlc.endsWith(':0'))).toBe(true);
  });

  it('create：显式 bucket / areaId 推导为 ANYTIME', async () => {
    const area = await testPrisma.area.create({ data: { userId: USER, title: '工作' } });
    const explicit = await h.tasks.create(USER, { title: 'a', bucket: TaskBucket.ANYTIME });
    const inArea = await h.tasks.create(USER, { title: 'b', areaId: area.id });
    expect(explicit.bucket).toBe(TaskBucket.ANYTIME);
    expect(inArea.bucket).toBe(TaskBucket.ANYTIME);
  });

  // ---------- update ----------

  it('update：tagIds 整组替换 / 清空；未传不动', async () => {
    await seedTag('tag-a');
    await seedTag('tag-b');
    await seedTask('task-1', { tags: { create: [{ tagId: 'tag-a' }] } });

    await h.tasks.update(USER, 'task-1', { tagIds: ['tag-b'] });
    expect(await tagIdsOf('task-1')).toEqual(['tag-b']);

    await h.tasks.update(USER, 'task-1', { title: '改名' });
    expect(await tagIdsOf('task-1')).toEqual(['tag-b']);

    const cleared = await h.tasks.update(USER, 'task-1', { tagIds: [] });
    expect(cleared.tags).toEqual([]);
    expect(await tagIdsOf('task-1')).toEqual([]);
    await expectLoggedAsStored('task', 'task-1');
  });

  it('update：移到别的项目清除分组；无关更新保留分组', async () => {
    const p1 = await testPrisma.project.create({ data: { userId: USER, title: 'P1' } });
    const p2 = await testPrisma.project.create({ data: { userId: USER, title: 'P2' } });
    const heading = await testPrisma.projectHeading.create({
      data: { userId: USER, projectId: p1.id, title: 'H' },
    });
    await seedTask('task-1', { projectId: p1.id, headingId: heading.id, bucket: 'ANYTIME' });

    await h.tasks.update(USER, 'task-1', { title: '改名' });
    expect((await testPrisma.task.findUnique({ where: { id: 'task-1' } }))!.headingId).toBe(
      heading.id,
    );

    await h.tasks.update(USER, 'task-1', { projectId: p2.id });
    const row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    expect(row.projectId).toBe(p2.id);
    expect(row.headingId).toBeNull();
  });

  it('update：提醒与重复规则跟随计划类型；规则以规范形 JSON 文本落库', async () => {
    await seedTask('task-1', {
      scheduledType: 'DATE',
      scheduledDate: new Date('2026-02-05T00:00:00Z'),
      bucket: 'SCHEDULED',
    });

    const dto = await h.tasks.update(USER, 'task-1', {
      reminderTime: '09:00',
      // 冗余 weekdays（day 单位）被归一化剥离；键序不影响落库文本
      repeatRule: { anchor: 'scheduled', weekdays: [1, 2], interval: 1, unit: 'day' },
    });
    let row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    expect(row.reminderTime).toBe('09:00');
    expect(row.repeatRule).toBe(dailyRuleJson);
    expect(dto.repeatRule).toEqual(dailyRule);

    // 换日期（DATE → DATE）保留提醒与规则
    await h.tasks.update(USER, 'task-1', { scheduledDate: '2026-03-05' });
    row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    expect(row.scheduledDate).toEqual(new Date('2026-03-05T00:00:00Z'));
    expect(row.reminderTime).toBe('09:00');
    expect(row.repeatRule).toBe(dailyRuleJson);

    // 移入 Someday 清除提醒与规则
    await h.tasks.update(USER, 'task-1', { scheduledType: ScheduledType.SOMEDAY });
    row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    expect(row.reminderTime).toBeNull();
    expect(row.repeatRule).toBeNull();
    await expectLoggedAsStored('task', 'task-1');
  });

  it('update：值未变的字段不写，不产生变更', async () => {
    await seedTask('task-1', { title: '同名' });
    await h.tasks.update(USER, 'task-1', { title: '同名' });
    expect(await loggedChanges()).toEqual([]);
  });

  it('update：他人的任务 / 不存在 → 404，不写', async () => {
    await seedTask('foreign', {}, OTHER_USER);
    await expect(h.tasks.update(USER, 'foreign', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.tasks.update(USER, 'missing', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await testPrisma.task.findUnique({ where: { id: 'foreign' } }))!.title).toBe('任务');
  });

  // ---------- 虚拟设备 0 的时钟语义 ----------

  it('REST 写胜过行上已有的设备时钟（包括超前的时钟）', async () => {
    const future = Date.now() + 24 * 60 * 60 * 1000;
    const deviceHlc = formatHlc({ wallMs: future, counter: 3, deviceId: 'dev-fast' });
    await h.hub.push(USER, [
      {
        entity: 'task',
        id: 'task-1',
        fields: {
          title: { value: '设备写', hlc: deviceHlc },
          createdAt: { value: new Date().toISOString(), hlc: deviceHlc },
          updatedAt: { value: new Date().toISOString(), hlc: deviceHlc },
        },
      },
    ]);

    await h.tasks.update(USER, 'task-1', { title: 'web 写' });

    const row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    expect(row.title).toBe('web 写');
    const logged = await lastLoggedState('task', 'task-1');
    expect(logged!.clocks.title > deviceHlc).toBe(true);
    expect(logged!.clocks.title.endsWith(':0')).toBe(true);
    // updatedAt 取 hub 当前时间，不跟着超前的时钟进入未来
    expect(row.updatedAt.getTime()).toBeLessThan(future);
    expect(hlcWallMs(logged!.clocks.title)).toBeGreaterThan(future);
  });

  it('多行操作失败整批回滚：数据与日志都不留痕', async () => {
    await seedTask('task-1', { createdAt: new Date('2026-01-01T00:00:00Z') });
    await seedTask('task-2', { createdAt: new Date('2026-01-02T00:00:00Z') });
    await expect(
      h.hub.writeAsHub(USER, async (batch) => {
        await batch.write('task', 'task-1', { title: '第一行已写' });
        throw new Error('第二行失败');
      }),
    ).rejects.toThrow('第二行失败');
    expect((await testPrisma.task.findUnique({ where: { id: 'task-1' } }))!.title).toBe('任务');
    expect(await loggedChanges()).toEqual([]);
  });

  // ---------- 生命周期 ----------

  it('remove / restore：只动任务本身；进 Trash 不改状态、清除提醒；恢复回 ACTIVE', async () => {
    await seedTask('task-1', {
      status: 'COMPLETED',
      settledAt: new Date('2026-02-01T00:00:00Z'),
      scheduledType: 'DATE',
      scheduledDate: new Date('2026-02-05T00:00:00Z'),
      reminderTime: '09:00',
    });
    await seedTask('task-2');

    const removed = await h.tasks.remove(USER, 'task-1');
    let row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    expect(row.trashedAt).toEqual(removed.trashedAt);
    expect(row.status).toBe(TaskStatus.COMPLETED);
    expect(row.reminderTime).toBeNull();
    expect((await testPrisma.task.findUnique({ where: { id: 'task-2' } }))!.trashedAt).toBeNull();

    await h.tasks.restore(USER, 'task-1');
    row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    expect(row.trashedAt).toBeNull();
    expect(row.status).toBe(TaskStatus.ACTIVE);
    expect(row.settledAt).toBeNull();
    await expectLoggedAsStored('task', 'task-1');

    await expect(h.tasks.remove(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.tasks.restore(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancel / complete 直接互改终态；uncancel / uncomplete 回 ACTIVE；了结清除提醒', async () => {
    await seedTask('task-1', {
      scheduledType: 'DATE',
      scheduledDate: new Date('2026-02-05T00:00:00Z'),
      reminderTime: '09:00',
    });

    const cancelled = await h.tasks.cancel(USER, 'task-1');
    expect(cancelled.status).toBe(TaskStatus.CANCELLED);
    expect(cancelled.completedAt).not.toBeNull();
    expect(cancelled.reminderTime).toBeNull();

    const completed = await h.tasks.complete(USER, 'task-1');
    expect(completed.status).toBe(TaskStatus.COMPLETED);

    const recancelled = await h.tasks.cancel(USER, 'task-1');
    expect(recancelled.status).toBe(TaskStatus.CANCELLED);

    const reopened = await h.tasks.uncomplete(USER, 'task-1');
    expect(reopened.status).toBe(TaskStatus.ACTIVE);
    expect(reopened.completedAt).toBeNull();

    await h.tasks.cancel(USER, 'task-1');
    expect((await h.tasks.uncancel(USER, 'task-1')).status).toBe(TaskStatus.ACTIVE);
    await expectLoggedAsStored('task', 'task-1');

    await expect(h.tasks.cancel(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---------- 重复派生（ADR-0012） ----------

  async function seedRepeating(data: Record<string, unknown> = {}) {
    await seedTag('tag-1');
    await seedTask('task-1', {
      title: '浇花',
      notes: '客厅绿植',
      scheduledType: 'DATE',
      scheduledDate: new Date('2026-02-05T00:00:00Z'),
      bucket: 'SCHEDULED',
      reminderTime: '09:00',
      repeatRule: dailyRuleJson,
      sortOrder: 3,
      tags: { create: [{ tagId: 'tag-1' }] },
      ...data,
    });
  }
  const expectedInstanceId = deriveRepeatInstanceId('task-1', dailyRule, '2026-02-06');

  it('complete 派生下一实例：确定性 id、复制集完整、子任务重置 ACTIVE，同一事务入日志', async () => {
    await seedRepeating();
    await testPrisma.subtask.createMany({
      data: [
        { id: 'st-1', taskId: 'task-1', title: '客厅', sortOrder: 0, status: 'COMPLETED' },
        { id: 'st-2', taskId: 'task-1', title: '阳台', sortOrder: 1 },
      ],
    });

    const dto = await h.tasks.complete(USER, 'task-1');
    expect(dto.status).toBe(TaskStatus.COMPLETED);
    expect(dto.repeatRule).toEqual(dailyRule); // 父任务保留规则作 Logbook 溯源

    const instance = await testPrisma.task.findUniqueOrThrow({
      where: { id: expectedInstanceId },
      include: { tags: true, subtasks: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(instance).toMatchObject({
      userId: USER,
      title: '浇花',
      notes: '客厅绿植',
      scheduledDate: new Date('2026-02-06T00:00:00Z'),
      scheduledType: ScheduledType.DATE,
      reminderTime: '09:00',
      repeatRule: dailyRuleJson,
      bucket: TaskBucket.SCHEDULED,
      status: TaskStatus.ACTIVE,
      sortOrder: 4,
    });
    expect(instance.tags.map((tt) => tt.tagId)).toEqual(['tag-1']);
    expect(instance.subtasks.map((s) => [s.id, s.title, s.status])).toEqual([
      [deriveSubtaskId(expectedInstanceId, 0), '客厅', TaskStatus.ACTIVE],
      [deriveSubtaskId(expectedInstanceId, 1), '阳台', TaskStatus.ACTIVE],
    ]);
    await expectLoggedAsStored('task', expectedInstanceId);
    await expectLoggedAsStored('subtask', deriveSubtaskId(expectedInstanceId, 0));
  });

  it('旧北京时间零点计划完成后派生明天，而非今天', async () => {
    h = await createHarness('Asia/Shanghai');
    await seedRepeating({ scheduledDate: new Date('2026-09-23T16:00:00Z') });
    await h.tasks.complete(USER, 'task-1');
    const instances = await testPrisma.task.findMany({ where: { id: { not: 'task-1' } } });
    expect(instances.map((task) => task.scheduledDate)).toEqual([new Date('2026-09-25T00:00:00Z')]);
  });

  it('不派生：实例已存在 / 到达 until / 无规则 / 已完成再完成 / 取消', async () => {
    await seedRepeating();
    await seedTask(expectedInstanceId, { title: '已存在的实例' });
    await h.tasks.complete(USER, 'task-1');
    expect(await testPrisma.task.count()).toBe(2);

    // 已 COMPLETED 再完成：不改写了结时间、不二次派生
    const settledAt = (await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } }))
      .settledAt;
    await h.tasks.complete(USER, 'task-1');
    expect(
      (await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } })).settledAt,
    ).toEqual(settledAt);

    await seedTask('expired', {
      scheduledType: 'DATE',
      scheduledDate: new Date('2026-02-05T00:00:00Z'),
      repeatRule: JSON.stringify({ ...dailyRule, until: '2026-02-05' }),
    });
    await h.tasks.complete(USER, 'expired');
    await seedTask('plain');
    await h.tasks.complete(USER, 'plain');
    await seedTask('to-cancel', {
      scheduledType: 'DATE',
      scheduledDate: new Date('2026-02-05T00:00:00Z'),
      repeatRule: dailyRuleJson,
    });
    const cancelled = await h.tasks.cancel(USER, 'to-cancel');
    expect(cancelled.repeatRule).toEqual(dailyRule);
    expect(await testPrisma.task.count()).toBe(5);
  });

  it('complete 写入派生来源 repeatSourceId', async () => {
    await seedRepeating();
    await h.tasks.complete(USER, 'task-1');
    const instance = await testPrisma.task.findUniqueOrThrow({ where: { id: expectedInstanceId } });
    expect(instance.repeatSourceId).toBe('task-1');
  });

  it('uncomplete / uncancel 不删除派生实例：不登记 Compact，再完成不重复派生', async () => {
    await seedRepeating();
    await testPrisma.subtask.create({ data: { id: 'st-1', taskId: 'task-1', title: '客厅' } });
    await h.tasks.complete(USER, 'task-1');

    const dto = await h.tasks.uncomplete(USER, 'task-1');
    expect(dto.status).toBe(TaskStatus.ACTIVE);
    expect(await testPrisma.task.findUnique({ where: { id: expectedInstanceId } })).not.toBeNull();
    expect(await registeredCompacted('task')).toEqual([]);
    expect(await compactedIdsInLog('task')).toEqual([]);

    await h.tasks.complete(USER, 'task-1');
    await h.tasks.cancel(USER, 'task-1');
    await h.tasks.uncancel(USER, 'task-1');
    const instances = await testPrisma.task.findMany({ where: { id: { not: 'task-1' } } });
    expect(instances.map((task) => task.id)).toEqual([expectedInstanceId]);
  });

  it('anchor=completion：来源已有派生实例时，换日再完成不重复派生', async () => {
    await seedRepeating({ repeatRule: JSON.stringify({ ...dailyRule, anchor: 'completion' }) });
    await seedTask('earlier-instance', { repeatSourceId: 'task-1' });
    await h.tasks.complete(USER, 'task-1');
    expect(await testPrisma.task.count()).toBe(2);
  });

  it('派生实例在 Trash：再完成换新 uuid 派生', async () => {
    await seedRepeating();
    await seedTask(expectedInstanceId, {
      repeatSourceId: 'task-1',
      trashedAt: new Date('2026-02-05T12:00:00Z'),
    });
    await h.tasks.complete(USER, 'task-1');
    const live = await testPrisma.task.findMany({
      where: { id: { not: 'task-1' }, trashedAt: null },
    });
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(expectedInstanceId);
    expect(live[0].repeatSourceId).toBe('task-1');
  });

  it('skip：计划日推进到今天、截止日平移、Subtask 重置，同一事务入日志', async () => {
    await seedRepeating({ dueDate: new Date('2026-02-07T00:00:00Z') });
    await testPrisma.subtask.create({
      data: { id: 'st-1', taskId: 'task-1', title: '客厅', status: 'COMPLETED' },
    });
    const today = new Date().toISOString().slice(0, 10);

    const dto = await h.tasks.skip(USER, 'task-1');
    expect(dto.scheduledDate).toEqual(new Date(`${today}T00:00:00Z`));
    const row = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    const shift =
      (Date.parse(`${today}T00:00:00Z`) - Date.parse('2026-02-05T00:00:00Z')) / 86_400_000;
    expect(row.dueDate).toEqual(new Date(Date.parse('2026-02-07T00:00:00Z') + shift * 86_400_000));
    expect(row.status).toBe(TaskStatus.ACTIVE);
    const subtask = await testPrisma.subtask.findUniqueOrThrow({ where: { id: 'st-1' } });
    expect(subtask.status).toBe(TaskStatus.ACTIVE);
    expect(await testPrisma.task.count()).toBe(1);
    await expectLoggedAsStored('task', 'task-1');
    await expectLoggedAsStored('subtask', 'st-1');
  });

  it('skip 不可用 → 409（message 为原因）；不存在 → 404', async () => {
    await seedRepeating();
    await seedTask('instance', { repeatSourceId: 'task-1' });
    await expect(h.tasks.skip(USER, 'task-1')).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'next-exists',
    });
    await seedTask('plain');
    await expect(h.tasks.skip(USER, 'plain')).rejects.toMatchObject({
      message: 'not-repeating',
    });
    await expect(h.tasks.skip(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---------- 转项目 / 重排 ----------

  it('convertToProject：新项目 + 按原顺序提升的任务 + 原任务物理删除，一个事务', async () => {
    const area = await testPrisma.area.create({ data: { userId: USER, title: 'A' } });
    await seedTag('tag-1');
    await testPrisma.project.create({ data: { userId: USER, title: '旧项目', sortOrder: 7 } });
    await seedTask('task-1', {
      title: '大任务',
      areaId: area.id,
      tags: { create: [{ tagId: 'tag-1' }] },
    });
    await testPrisma.subtask.createMany({
      data: [
        { id: 'st-2', taskId: 'task-1', title: '第二步', sortOrder: 1, status: 'COMPLETED' },
        { id: 'st-1', taskId: 'task-1', title: '第一步', sortOrder: 0 },
      ],
    });

    const project = await h.tasks.convertToProject(USER, 'task-1');
    expect(project).toMatchObject({ title: '大任务', areaId: area.id, sortOrder: 8 });
    expect(project.tags.map((tag) => tag.id)).toEqual(['tag-1']);

    const promoted = await testPrisma.task.findMany({ where: { projectId: project.id } });
    const ordered = [...promoted].sort((a, b) => (a.position! < b.position! ? -1 : 1));
    expect(ordered.map((task) => [task.title, task.status, task.bucket])).toEqual([
      ['第一步', TaskStatus.ACTIVE, TaskBucket.ANYTIME],
      ['第二步', TaskStatus.COMPLETED, TaskBucket.ANYTIME],
    ]);
    expect(await testPrisma.task.findUnique({ where: { id: 'task-1' } })).toBeNull();
    expect(await registeredCompacted('task')).toEqual(['task-1']);
    expect(await registeredCompacted('subtask')).toEqual(['st-1', 'st-2']);
    await expectLoggedAsStored('project', project.id);
    for (const task of promoted) await expectLoggedAsStored('task', task.id);
  });

  it('convertToProject：没有子任务不提升；不存在 → 404', async () => {
    await seedTask('task-1');
    const project = await h.tasks.convertToProject(USER, 'task-1');
    expect(await testPrisma.task.count({ where: { projectId: project.id } })).toBe(0);
    await expect(h.tasks.convertToProject(USER, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reorder：sortOrder 与同口径 Position 一起写；越权 / 不存在 / 重复 id → 404', async () => {
    const created = {
      'task-1': new Date('2026-01-01T00:00:00Z'),
      'task-2': new Date('2026-01-02T00:00:00Z'),
    };
    await seedTask('task-1', { createdAt: created['task-1'] });
    await seedTask('task-2', { createdAt: created['task-2'] });
    await seedTask('foreign', {}, OTHER_USER);

    await h.tasks.reorder(USER, ['task-2', 'task-1']);
    const rows = await testPrisma.task.findMany({ where: { userId: USER } });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    // task-2 的 legacy 行 position 为空、sortOrder 本就是 0：有效位次已相同，不写
    expect([byId['task-2'].sortOrder, effectivePosition(byId['task-2'])]).toEqual([
      0,
      synthPosition(0, created['task-2']),
    ]);
    expect(byId['task-1']).toMatchObject({
      sortOrder: 1,
      position: synthPosition(1, created['task-1']),
    });
    await expectLoggedAsStored('task', 'task-1');

    for (const ids of [
      ['task-1', 'foreign'],
      ['task-1', 'missing'],
      ['task-1', 'task-1'],
    ]) {
      await expect(h.tasks.reorder(USER, ids)).rejects.toBeInstanceOf(NotFoundException);
    }
  });
});

async function tagIdsOf(taskId: string): Promise<string[]> {
  const rows = await testPrisma.taskTag.findMany({ where: { taskId } });
  return rows.map((row) => row.tagId).sort();
}
