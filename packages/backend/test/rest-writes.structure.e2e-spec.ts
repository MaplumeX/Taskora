/**
 * 其余 REST 服务的写路径（真实 Postgres + 真实 Sync Hub，local-first-v3
 * issue 05）：Subtask、Project、Project Heading、Area、Tag、TagGroup、
 * 清空 Trash。每个写都经合并器，数据与日志同事务。
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeEach, expect, it } from 'vitest';

import { positionBetween } from '@taskora/engine';
import { HeadingStatus, ProjectStatus, TaskStatus } from '@taskora/shared';

import { disconnectTestDb, testPrisma } from './db';
import {
  compactedIdsInLog,
  createHarness,
  dbDescribe,
  expectLoggedAsStored,
  OTHER_USER,
  registeredCompacted,
  USER,
} from './rest-writes.harness';

type Harness = Awaited<ReturnType<typeof createHarness>>;

const createdAt = (day: number) => new Date(`2026-01-0${day}T00:00:00Z`);

async function seedProject(id: string, data: Record<string, unknown> = {}, userId = USER) {
  return testPrisma.project.create({ data: { id, userId, title: id, ...data } as never });
}

async function seedTask(id: string, data: Record<string, unknown> = {}, userId = USER) {
  return testPrisma.task.create({ data: { id, userId, title: id, ...data } as never });
}

async function seedHeading(id: string, projectId: string, data: Record<string, unknown> = {}) {
  return testPrisma.projectHeading.create({
    data: { id, userId: USER, projectId, title: id, ...data } as never,
  });
}

dbDescribe('REST 结构实体写路径（真实 Postgres）', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // ---------- Subtask ----------

  it('Subtask：create 追加在末尾；改名 / 状态流转；删除走 Compact', async () => {
    await seedTask('task-1');
    const first = await h.subtasks.create(USER, 'task-1', { title: '一' });
    const second = await h.subtasks.create(USER, 'task-1', { title: '二' });
    expect(first.position! < second.position!).toBe(true);
    expect(first.status).toBe(TaskStatus.ACTIVE);

    expect((await h.subtasks.update(USER, first.id, { title: '一改' })).title).toBe('一改');
    const done = await h.subtasks.update(USER, first.id, { status: TaskStatus.COMPLETED });
    expect(done.completedAt).not.toBeNull();
    const cancelled = await h.subtasks.cancel(USER, first.id);
    expect(cancelled.status).toBe(TaskStatus.CANCELLED);
    expect(cancelled.completedAt).not.toBeNull();
    const reopened = await h.subtasks.uncancel(USER, first.id);
    expect([reopened.status, reopened.completedAt]).toEqual([TaskStatus.ACTIVE, null]);
    expect((await h.subtasks.complete(USER, first.id)).status).toBe(TaskStatus.COMPLETED);
    expect((await h.subtasks.uncomplete(USER, first.id)).status).toBe(TaskStatus.ACTIVE);
    await expectLoggedAsStored('subtask', first.id);

    await h.subtasks.reorder(USER, 'task-1', [second.id, first.id]);
    const ordered = (await h.tasks.findOne(USER, 'task-1')).subtasks ?? [];
    expect(ordered.map((s) => s.id)).toEqual([second.id, first.id]);

    await h.subtasks.remove(USER, first.id);
    expect(await testPrisma.subtask.findUnique({ where: { id: first.id } })).toBeNull();
    expect(await registeredCompacted('subtask')).toEqual([first.id]);
    expect(await compactedIdsInLog('subtask')).toEqual([first.id]);
  });

  it('Subtask：afterId 插入其后、后续顺延；客户端 id 被采用，重试幂等，跨任务冲突 → 409', async () => {
    await seedTask('task-1');
    await seedTask('task-2');
    const first = await h.subtasks.create(USER, 'task-1', { title: '一' });
    const third = await h.subtasks.create(USER, 'task-1', { title: '三' });
    const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    const second = await h.subtasks.create(USER, 'task-1', { title: '二', id, afterId: first.id });
    expect(second.id).toBe(id);
    await expectLoggedAsStored('subtask', second.id);
    // Position 只给新行分配（插在「一」「三」之间），其余行不动
    const thirdNow = await testPrisma.subtask.findUniqueOrThrow({ where: { id: third.id } });
    expect(thirdNow.position).toBe(third.position);
    expect(first.position! < second.position! && second.position! < third.position!).toBe(true);

    const titles = async () =>
      ((await h.tasks.findOne(USER, 'task-1')).subtasks ?? []).map((s) => s.title);
    expect(await titles()).toEqual(['一', '二', '三']);

    expect(
      (await h.subtasks.create(USER, 'task-1', { title: '二', id, afterId: first.id })).id,
    ).toBe(id);
    expect(await titles()).toEqual(['一', '二', '三']);
    await expect(h.subtasks.create(USER, 'task-2', { title: 'x', id })).rejects.toBeInstanceOf(
      ConflictException,
    );

    await h.subtasks.create(USER, 'task-1', { title: '尾', afterId: 'missing' });
    expect(await titles()).toEqual(['一', '二', '三', '尾']);
  });

  it('Subtask：他人的任务 / Subtask → 404；重排含外来或重复 id → 404', async () => {
    await seedTask('mine');
    await seedTask('foreign', {}, OTHER_USER);
    await testPrisma.subtask.create({ data: { id: 'st-foreign', taskId: 'foreign', title: 'x' } });
    const mine = await h.subtasks.create(USER, 'mine', { title: 'a' });

    await expect(h.subtasks.create(USER, 'foreign', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    for (const call of [
      () => h.subtasks.update(USER, 'st-foreign', { title: 'x' }),
      () => h.subtasks.remove(USER, 'st-foreign'),
      () => h.subtasks.complete(USER, 'missing'),
      () => h.subtasks.reorder(USER, 'foreign', ['st-foreign']),
      () => h.subtasks.reorder(USER, 'mine', [mine.id, 'st-foreign']),
      () => h.subtasks.reorder(USER, 'mine', [mine.id, mine.id]),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    }
    expect((await testPrisma.subtask.findUnique({ where: { id: 'st-foreign' } }))!.title).toBe('x');
  });

  // ---------- Project ----------

  it('Project：create 排在末尾（字节序最大的 Position 之后）', async () => {
    const empty = await h.projects.create(USER, { title: '第一个' });
    expect(empty.position).toBe(positionBetween(null, null));
    // 大小写混排：Postgres 默认排序规则会把 'a0z' 排在 'a0Z' 前，字节序相反
    await seedProject('p-upper', { position: 'a0Z' });
    await seedProject('p-lower', { position: 'a0z' });
    const created = await h.projects.create(USER, { title: '新项目' });
    expect(created).toMatchObject({ taskTotalCount: 0, taskCompletedCount: 0 });
    expect(created.position).toBe(positionBetween('a0z', null));
    expect((await h.projects.findAll(USER)).at(-1)?.id).toBe(created.id);
    await expectLoggedAsStored('project', created.id);
  });

  it('Project：进 Trash 级联下属任务（已在 Trash 的不动）；恢复只捡回同时间戳的', async () => {
    await seedProject('p-1');
    await seedTask('t-out', {
      projectId: 'p-1',
      scheduledType: 'DATE',
      scheduledDate: createdAt(5),
      reminderTime: '09:00',
    });
    const earlier = new Date('2025-12-01T00:00:00Z');
    await seedTask('t-in', { projectId: 'p-1', trashedAt: earlier });

    const { trashedAt } = await h.projects.remove(USER, 'p-1');
    const project = await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-1' } });
    expect(project.trashedAt).toEqual(trashedAt);
    expect(project.status).toBe(ProjectStatus.ACTIVE);
    const out = await testPrisma.task.findUniqueOrThrow({ where: { id: 't-out' } });
    expect(out.trashedAt).toEqual(trashedAt);
    expect(out.reminderTime).toBeNull();
    expect(out.status).toBe(TaskStatus.ACTIVE);
    expect((await testPrisma.task.findUniqueOrThrow({ where: { id: 't-in' } })).trashedAt).toEqual(
      earlier,
    );
    await expectLoggedAsStored('task', 't-out');

    await h.projects.restore(USER, 'p-1');
    expect(
      (await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-1' } })).trashedAt,
    ).toBeNull();
    expect(
      (await testPrisma.task.findUniqueOrThrow({ where: { id: 't-out' } })).trashedAt,
    ).toBeNull();
    expect((await testPrisma.task.findUniqueOrThrow({ where: { id: 't-in' } })).trashedAt).toEqual(
      earlier,
    );

    await expect(h.projects.remove(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.projects.restore(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Project：Trash 中 update 改日期即放回并级联捡回任务；改标题不放回', async () => {
    await seedProject('p-1');
    await seedTask('t-out', { projectId: 'p-1' });
    await h.projects.remove(USER, 'p-1');

    await h.projects.update(USER, 'p-1', { title: '改名' });
    expect(
      (await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-1' } })).trashedAt,
    ).not.toBeNull();

    await h.projects.update(USER, 'p-1', { dueDate: '2026-03-01' });
    expect(
      (await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-1' } })).trashedAt,
    ).toBeNull();
    expect(
      (await testPrisma.task.findUniqueOrThrow({ where: { id: 't-out' } })).trashedAt,
    ).toBeNull();
    await expectLoggedAsStored('task', 't-out');
  });

  it('Project：update 标签整组替换；complete / uncomplete；reorder 双排序键', async () => {
    await testPrisma.tag.create({ data: { id: 'tag-1', userId: USER, title: 't' } });
    await seedProject('p-1', { position: 'a0' });
    await seedProject('p-2', { position: 'a1' });
    await seedProject('foreign', {}, OTHER_USER);

    const updated = await h.projects.update(USER, 'p-1', { title: '改名', tagIds: ['tag-1'] });
    expect(updated.tags.map((tag) => tag.id)).toEqual(['tag-1']);
    expect((await h.projects.complete(USER, 'p-1')).status).toBe(ProjectStatus.COMPLETED);
    expect((await h.projects.uncomplete(USER, 'p-1')).status).toBe(ProjectStatus.ACTIVE);

    await h.projects.reorder(USER, ['p-2', 'p-1']);
    expect((await h.projects.findAll(USER)).map((p) => p.id)).toEqual(['p-2', 'p-1']);
    // 只移动一行（最长有序子序列之外的那一行）
    const p1 = await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-1' } });
    const p2 = await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-2' } });
    expect([p1.position === 'a0', p2.position === 'a1'].filter(Boolean)).toHaveLength(1);
    await expectLoggedAsStored('project', p1.position === 'a0' ? 'p-2' : 'p-1');

    await expect(h.projects.reorder(USER, ['p-1', 'foreign'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.projects.reorder(USER, ['p-1', 'missing'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('Project 重复（recurring-projects）：完成时了结剩余任务并派生整份下一轮；幂等；跳过本次', async () => {
    const rule = { unit: 'week', interval: 1, anchor: 'scheduled' } as const;
    await seedProject('p-1', {
      position: 'a0',
      scheduledType: 'DATE',
      bucket: 'SCHEDULED',
      scheduledDate: new Date('2030-01-07T00:00:00Z'),
      dueDate: new Date('2030-01-09T00:00:00Z'),
    });
    await seedProject('p-2', { position: 'a1' });
    await h.projects.update(USER, 'p-1', { repeatRule: rule });
    await seedHeading('h-1', 'p-1', { position: 'a0' });
    await seedTask('t-done', {
      projectId: 'p-1',
      headingId: 'h-1',
      bucket: 'ANYTIME',
      status: TaskStatus.COMPLETED,
      settledAt: new Date('2030-01-07T08:00:00Z'),
    });
    await testPrisma.subtask.create({
      data: { id: 's-1', taskId: 't-done', title: 'step', status: TaskStatus.COMPLETED } as never,
    });
    await seedTask('t-open', {
      projectId: 'p-1',
      bucket: 'SCHEDULED',
      scheduledType: 'DATE',
      scheduledDate: new Date('2030-01-08T00:00:00Z'),
    });

    // 跳过本次：项目与未了结任务一起推进一周，已完成的不动
    const skipped = await h.projects.skip(USER, 'p-1');
    expect(skipped.scheduledDate?.toISOString().slice(0, 10)).toBe('2030-01-14');
    expect(
      (await testPrisma.task.findUniqueOrThrow({ where: { id: 't-open' } })).scheduledDate,
    ).toEqual(new Date('2030-01-15T00:00:00Z'));

    const completed = await h.projects.complete(USER, 'p-1', { settleRemaining: 'cancelled' });
    expect(completed.status).toBe(ProjectStatus.COMPLETED);
    expect((await testPrisma.task.findUniqueOrThrow({ where: { id: 't-open' } })).status).toBe(
      TaskStatus.CANCELLED,
    );

    const all = await h.projects.findAll(USER);
    expect(all.map((p) => p.id).slice(0, 1)).toEqual(['p-1']);
    expect(all.at(-1)!.id).toBe('p-2'); // 下一轮紧跟来源项目
    const next = all[1];
    expect(next).toMatchObject({
      status: ProjectStatus.ACTIVE,
      repeatRule: rule,
      repeatSourceId: 'p-1',
      taskTotalCount: 2,
      taskCompletedCount: 0,
    });
    expect(next.scheduledDate?.toISOString().slice(0, 10)).toBe('2030-01-21');
    await expectLoggedAsStored('project', next.id);

    const heading = await testPrisma.projectHeading.findFirstOrThrow({
      where: { projectId: next.id },
    });
    expect(heading.status).toBe(HeadingStatus.ACTIVE);
    const copies = await testPrisma.task.findMany({
      where: { projectId: next.id },
      include: { subtasks: true },
    });
    const done = copies.find((t) => t.title === 't-done')!;
    expect(done).toMatchObject({ status: TaskStatus.ACTIVE, headingId: heading.id });
    expect(done.subtasks.map((s) => [s.title, s.status])).toEqual([['step', TaskStatus.ACTIVE]]);
    expect(copies.find((t) => t.title === 't-open')!.scheduledDate).toEqual(
      new Date('2030-01-22T00:00:00Z'),
    );

    // 重开再完成不重复派生；下一轮已存在时不可跳过
    await h.projects.uncomplete(USER, 'p-1');
    await expect(h.projects.skip(USER, 'p-1')).rejects.toBeInstanceOf(ConflictException);
    await h.projects.complete(USER, 'p-1');
    expect(await testPrisma.project.count({ where: { repeatSourceId: 'p-1' } })).toBe(1);
  });

  // ---------- Project Heading ----------

  it('Heading：create 追加在末尾；update 改名；他人的分组 → 404', async () => {
    await seedProject('p-1');
    await seedHeading('h-0', 'p-1', { position: 'a2' });
    const created = await h.headings.create(USER, { projectId: 'p-1', title: '新分组' });
    expect(created).toMatchObject({ status: HeadingStatus.ACTIVE, userId: USER });
    expect(created.position).toBe(positionBetween('a2', null));
    await expectLoggedAsStored('project-heading', created.id);

    expect((await h.headings.update(USER, created.id, { title: '改名' }))!.title).toBe('改名');
    await expect(h.headings.update(USER, 'foreign', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      h.headings.create(USER, { projectId: 'missing', title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Heading：归档完成未了结的任务（清提醒），已了结 / 已在 Trash 的不动；取消归档不动任务', async () => {
    await seedProject('p-1');
    await seedHeading('h-1', 'p-1');
    const common = { projectId: 'p-1', headingId: 'h-1' };
    await seedTask('active', { ...common, reminderTime: '09:00' });
    await seedTask('done', { ...common, status: 'COMPLETED', settledAt: createdAt(1) });
    await seedTask('trashed', { ...common, trashedAt: createdAt(2) });

    const archived = await h.headings.archive(USER, 'h-1');
    expect(archived!.status).toBe(HeadingStatus.COMPLETED);
    expect(archived!.completedAt).not.toBeNull();
    const active = await testPrisma.task.findUniqueOrThrow({ where: { id: 'active' } });
    expect([active.status, active.reminderTime]).toEqual([TaskStatus.COMPLETED, null]);
    expect(active.settledAt).not.toBeNull();
    expect((await testPrisma.task.findUniqueOrThrow({ where: { id: 'done' } })).settledAt).toEqual(
      createdAt(1),
    );
    expect((await testPrisma.task.findUniqueOrThrow({ where: { id: 'trashed' } })).status).toBe(
      TaskStatus.ACTIVE,
    );
    await expectLoggedAsStored('task', 'active');

    const unarchived = await h.headings.unarchive(USER, 'h-1');
    expect([unarchived!.status, unarchived!.completedAt]).toEqual([HeadingStatus.ACTIVE, null]);
    expect((await testPrisma.task.findUniqueOrThrow({ where: { id: 'active' } })).status).toBe(
      TaskStatus.COMPLETED,
    );

    await expect(h.headings.archive(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.headings.unarchive(USER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Heading：转项目——新项目继承区域、排在末尾；全部任务（含 Trash）移入；分组走 Compact', async () => {
    const area = await testPrisma.area.create({ data: { userId: USER, title: 'A' } });
    await seedProject('p-1', { areaId: area.id });
    await seedProject('p-last', { position: 'a5' });
    await seedHeading('h-1', 'p-1', { title: 'Build' });
    await seedTask('t-1', { projectId: 'p-1', headingId: 'h-1' });
    await seedTask('t-trashed', { projectId: 'p-1', headingId: 'h-1', trashedAt: createdAt(1) });

    const project = await h.headings.convertToProject(USER, 'h-1');
    expect(project).toMatchObject({
      title: 'Build',
      areaId: area.id,
      position: positionBetween('a5', null),
      status: ProjectStatus.ACTIVE,
      tags: [],
    });
    const moved = await testPrisma.task.findMany({ where: { projectId: project.id } });
    expect(moved.map((task) => [task.id, task.headingId]).sort()).toEqual([
      ['t-1', null],
      ['t-trashed', null],
    ]);
    expect(await testPrisma.projectHeading.findUnique({ where: { id: 'h-1' } })).toBeNull();
    expect(await registeredCompacted('project-heading')).toEqual(['h-1']);
    expect(await compactedIdsInLog('project-heading')).toEqual(['h-1']);
    await expectLoggedAsStored('project', project.id);
    await expectLoggedAsStored('task', 't-1');

    // 源项目无区域 → null；空分组 → 空项目
    await seedHeading('h-empty', 'p-last');
    const emptyProject = await h.headings.convertToProject(USER, 'h-empty');
    expect(emptyProject.areaId).toBeNull();
    expect(await testPrisma.task.count({ where: { projectId: emptyProject.id } })).toBe(0);

    await expect(h.headings.convertToProject(USER, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('Heading：布局重排一起写分组顺序、归属与任务双排序键；与当前数据不符 → 400', async () => {
    await seedProject('p-1');
    await seedHeading('h-1', 'p-1', { position: 'a0' });
    await seedHeading('h-2', 'p-1', { position: 'a1' });
    await seedTask('task-1', { projectId: 'p-1', position: 'a0' });
    await seedTask('task-2', { projectId: 'p-1', position: 'a1', headingId: 'h-1' });

    await h.headings.reorder(USER, {
      projectId: 'p-1',
      ungroupedTaskIds: ['task-2'],
      groups: [
        { headingId: 'h-2', taskIds: ['task-1'] },
        { headingId: 'h-1', taskIds: [] },
      ],
    });
    expect((await h.headings.findAll(USER, 'p-1')).map((heading) => heading.id)).toEqual([
      'h-2',
      'h-1',
    ]);
    const t1 = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    const t2 = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-2' } });
    // 视觉顺序（ungrouped 在前：task-2，再 h-2 分组的 task-1）决定 position，只移动一行
    expect([t1.headingId, t2.headingId]).toEqual(['h-2', null]);
    expect(t2.position! < t1.position!).toBe(true);
    expect([t1.position === 'a0', t2.position === 'a1'].filter(Boolean)).toHaveLength(1);
    await expectLoggedAsStored('task', 'task-1');

    for (const layout of [
      { ungroupedTaskIds: ['task-1', 'task-1'], groups: [] },
      { ungroupedTaskIds: ['task-1'], groups: [] },
      { ungroupedTaskIds: ['task-1', 'task-2', 'foreign'], groups: [] },
      {
        ungroupedTaskIds: ['task-1', 'task-2'],
        groups: [
          { headingId: 'h-1', taskIds: [] },
          { headingId: 'h-1', taskIds: [] },
        ],
      },
    ]) {
      await expect(
        h.headings.reorder(USER, {
          projectId: 'p-1',
          ungroupedTaskIds: layout.ungroupedTaskIds,
          groups: layout.groups.length
            ? layout.groups
            : [
                { headingId: 'h-1', taskIds: [] },
                { headingId: 'h-2', taskIds: [] },
              ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('Heading：删除——直接任务进 Trash（状态不变，已在 Trash 的不动），分组走 Compact', async () => {
    await seedProject('p-1');
    await seedHeading('h-1', 'p-1');
    await seedTask('done', {
      projectId: 'p-1',
      headingId: 'h-1',
      status: 'COMPLETED',
      settledAt: createdAt(1),
    });
    await seedTask('trashed', { projectId: 'p-1', headingId: 'h-1', trashedAt: createdAt(2) });

    const { trashedAt } = await h.headings.remove(USER, 'h-1');
    const done = await testPrisma.task.findUniqueOrThrow({ where: { id: 'done' } });
    expect([done.trashedAt, done.status]).toEqual([trashedAt, TaskStatus.COMPLETED]);
    expect(
      (await testPrisma.task.findUniqueOrThrow({ where: { id: 'trashed' } })).trashedAt,
    ).toEqual(createdAt(2));
    expect(await testPrisma.projectHeading.findUnique({ where: { id: 'h-1' } })).toBeNull();
    expect(await compactedIdsInLog('project-heading')).toEqual(['h-1']);

    // 空分组：不写任何任务
    await seedHeading('h-empty', 'p-1');
    await h.headings.remove(USER, 'h-empty');
    expect(await registeredCompacted('project-heading')).toEqual(['h-1', 'h-empty']);
  });

  // ---------- Area / Tag / TagGroup ----------

  it('Area：create 带标签、排在末尾；update 部分字段与标签整组替换；删除走 Compact；reorder', async () => {
    await testPrisma.tag.create({ data: { id: 'tag-1', userId: USER, title: 't1' } });
    await testPrisma.tag.create({ data: { id: 'tag-2', userId: USER, title: 't2' } });
    const first = await h.areas.create(USER, { title: '工作', tagIds: ['tag-1', 'tag-1'] });
    const second = await h.areas.create(USER, { title: '生活' });
    expect(first.position! < second.position!).toBe(true);
    expect(first.tags.map((tag) => tag.id)).toEqual(['tag-1']);

    const renamed = await h.areas.update(USER, first.id, { notes: '备注' });
    expect([renamed.title, renamed.notes, renamed.tags.map((tag) => tag.id)]).toEqual([
      '工作',
      '备注',
      ['tag-1'],
    ]);
    const retagged = await h.areas.update(USER, first.id, { tagIds: ['tag-2'] });
    expect(retagged.tags.map((tag) => tag.id)).toEqual(['tag-2']);
    await expectLoggedAsStored('area', first.id);

    await h.areas.reorder(USER, [second.id, first.id]);
    expect((await h.areas.findAll(USER)).map((area) => area.id)).toEqual([second.id, first.id]);
    // 只有被移动的一行换了 Position
    const [secondNow, firstNow] = await h.areas.findAll(USER);
    expect(
      [secondNow.position !== second.position, firstNow.position !== first.position].filter(
        Boolean,
      ),
    ).toHaveLength(1);
    await expect(h.areas.reorder(USER, [first.id, 'missing'])).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await seedTask('t-in-area', { areaId: first.id, bucket: 'ANYTIME' });
    await h.areas.remove(USER, first.id);
    expect(await testPrisma.area.findUnique({ where: { id: first.id } })).toBeNull();
    expect(
      (await testPrisma.task.findUniqueOrThrow({ where: { id: 't-in-area' } })).areaId,
    ).toBeNull();
    expect(await compactedIdsInLog('area')).toEqual([first.id]);
    await expect(h.areas.remove(USER, first.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Tag / TagGroup：create 默认值；update；删除走 Compact（分组删除后标签解除归属）', async () => {
    const group = await h.tagGroups.create(USER, { title: '上下文' });
    expect(group).toMatchObject({ title: '上下文', tags: [] });
    const tag = await h.tags.create(USER, { title: '电脑', tagGroupId: group.id });
    expect(tag).toMatchObject({ color: '#3B82F6', tagGroupId: group.id });
    const colored = await h.tags.create(USER, { title: '电话', color: '#EF4444' });
    expect(colored.color).toBe('#EF4444');
    // 新标签排最前
    expect(colored.position! < tag.position!).toBe(true);

    expect((await h.tags.update(USER, tag.id, { title: '笔记本' })).title).toBe('笔记本');
    expect((await h.tagGroups.update(USER, group.id, { title: '场景' })).title).toBe('场景');
    await expectLoggedAsStored('tag', tag.id);
    await expectLoggedAsStored('tag-group', group.id);

    await h.tagGroups.remove(USER, group.id);
    expect(
      (await testPrisma.tag.findUniqueOrThrow({ where: { id: tag.id } })).tagGroupId,
    ).toBeNull();
    await h.tags.remove(USER, colored.id);
    expect(await compactedIdsInLog('tag-group')).toEqual([group.id]);
    expect(await compactedIdsInLog('tag')).toEqual([colored.id]);
    await expect(h.tags.update(USER, 'missing', { title: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('Tag / TagGroup reorder：findAll 按新顺序返回；不属于本人的 id 拒绝', async () => {
    const a = await h.tags.create(USER, { title: 'a' });
    const b = await h.tags.create(USER, { title: 'b' });
    const c = await h.tags.create(USER, { title: 'c' });
    await h.tags.reorder(USER, [c.id, a.id, b.id]);
    expect((await h.tags.findAll(USER)).map((tag) => tag.title)).toEqual(['c', 'a', 'b']);
    await expectLoggedAsStored('tag', a.id);

    const g1 = await h.tagGroups.create(USER, { title: 'g1' });
    const g2 = await h.tagGroups.create(USER, { title: 'g2' });
    // 新建排最前
    expect((await h.tagGroups.findAll(USER)).map((group) => group.title)).toEqual(['g2', 'g1']);
    await h.tagGroups.reorder(USER, [g1.id, g2.id]);
    expect((await h.tagGroups.findAll(USER)).map((group) => group.title)).toEqual(['g1', 'g2']);

    await expect(h.tags.reorder(USER, [a.id, 'missing'])).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.tagGroups.reorder(USER, ['missing'])).rejects.toBeInstanceOf(NotFoundException);
  });

  // ---------- 清空 Trash ----------

  it('emptyTrash：Trash 里的任务、项目及其下全部任务物理删除，级联 Subtask / 分组，同事务广播', async () => {
    await seedProject('p-trashed', { trashedAt: createdAt(1) });
    await seedProject('p-alive');
    await seedHeading('h-1', 'p-trashed');
    await seedTask('t-trashed', { trashedAt: createdAt(1) });
    await seedTask('t-under-trashed-project', { projectId: 'p-trashed' });
    await seedTask('t-alive', { projectId: 'p-alive' });
    await seedTask('t-foreign-trashed', { trashedAt: createdAt(1) }, OTHER_USER);
    await testPrisma.subtask.create({ data: { id: 'st-1', taskId: 't-trashed', title: 's' } });

    const result = await h.feed.emptyTrash(USER);
    expect(result).toEqual({ deletedTasks: 2, deletedProjects: 1 });
    const remaining = await testPrisma.task.findMany({ select: { id: true } });
    expect(remaining.map((task) => task.id).sort()).toEqual(['t-alive', 't-foreign-trashed']);
    expect(await testPrisma.project.findUnique({ where: { id: 'p-trashed' } })).toBeNull();
    expect(await registeredCompacted('task')).toEqual(['t-trashed', 't-under-trashed-project']);
    expect(await registeredCompacted('project')).toEqual(['p-trashed']);
    expect(await registeredCompacted('subtask')).toEqual(['st-1']);
    expect(await registeredCompacted('project-heading')).toEqual(['h-1']);
    expect((await compactedIdsInLog('task')).sort()).toEqual([
      't-trashed',
      't-under-trashed-project',
    ]);
    expect(await compactedIdsInLog('project-heading')).toEqual(['h-1']);

    // 空 Trash：无操作
    expect(await h.feed.emptyTrash(USER)).toEqual({ deletedTasks: 0, deletedProjects: 0 });
  });
});
