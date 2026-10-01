/**
 * 其余 REST 服务的写路径（真实 Postgres + 真实 Sync Hub，local-first-v3
 * issue 05）：Subtask、Project、Project Heading、Area、Tag、TagGroup、
 * 清空 Trash。每个写都经合并器，数据与日志同事务。
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeEach, expect, it } from 'vitest';

import { effectivePosition, synthPosition } from '@taskora/engine';
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
    expect([first.sortOrder, second.sortOrder]).toEqual([0, 1]);
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
    const ordered = await testPrisma.subtask.findMany({ orderBy: { sortOrder: 'asc' } });
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
    expect([second.id, second.sortOrder]).toEqual([id, 1]);
    await expectLoggedAsStored('subtask', third.id);

    const titles = async () =>
      (
        await testPrisma.subtask.findMany({
          where: { taskId: 'task-1' },
          orderBy: { sortOrder: 'asc' },
        })
      ).map((s) => s.title);
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

  it('Project：create 排在末尾（sortOrder = max + 1，同口径 Position）', async () => {
    const empty = await h.projects.create(USER, { title: '第一个' });
    expect(empty.sortOrder).toBe(0);
    await seedProject('p-high', { sortOrder: 4 });
    const created = await h.projects.create(USER, { title: '新项目' });
    expect(created).toMatchObject({ sortOrder: 5, taskTotalCount: 0, taskCompletedCount: 0 });
    const row = await testPrisma.project.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.position).toBe(synthPosition(5, row.createdAt));
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

  it('Project：update 标签整组替换；complete / uncomplete；reorder 双排序键', async () => {
    await testPrisma.tag.create({ data: { id: 'tag-1', userId: USER, title: 't' } });
    await seedProject('p-1', { createdAt: createdAt(1) });
    await seedProject('p-2', { createdAt: createdAt(2), sortOrder: 1 });
    await seedProject('foreign', {}, OTHER_USER);

    const updated = await h.projects.update(USER, 'p-1', { title: '改名', tagIds: ['tag-1'] });
    expect(updated.tags.map((tag) => tag.id)).toEqual(['tag-1']);
    expect((await h.projects.complete(USER, 'p-1')).status).toBe(ProjectStatus.COMPLETED);
    expect((await h.projects.uncomplete(USER, 'p-1')).status).toBe(ProjectStatus.ACTIVE);

    await h.projects.reorder(USER, ['p-2', 'p-1']);
    const p1 = await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-1' } });
    const p2 = await testPrisma.project.findUniqueOrThrow({ where: { id: 'p-2' } });
    expect([p2.sortOrder, p2.position]).toEqual([0, synthPosition(0, createdAt(2))]);
    expect([p1.sortOrder, p1.position]).toEqual([1, synthPosition(1, createdAt(1))]);
    await expectLoggedAsStored('project', 'p-1');

    await expect(h.projects.reorder(USER, ['p-1', 'foreign'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.projects.reorder(USER, ['p-1', 'missing'])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ---------- Project Heading ----------

  it('Heading：create 追加在末尾；update 改名；他人的分组 → 404', async () => {
    await seedProject('p-1');
    await seedHeading('h-0', 'p-1', { sortOrder: 2 });
    const created = await h.headings.create(USER, { projectId: 'p-1', title: '新分组' });
    expect(created).toMatchObject({ sortOrder: 3, status: HeadingStatus.ACTIVE, userId: USER });
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
    await seedProject('p-last', { sortOrder: 5 });
    await seedHeading('h-1', 'p-1', { title: 'Build' });
    await seedTask('t-1', { projectId: 'p-1', headingId: 'h-1' });
    await seedTask('t-trashed', { projectId: 'p-1', headingId: 'h-1', trashedAt: createdAt(1) });

    const project = await h.headings.convertToProject(USER, 'h-1');
    expect(project).toMatchObject({
      title: 'Build',
      areaId: area.id,
      sortOrder: 6,
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
    await seedHeading('h-1', 'p-1');
    await seedHeading('h-2', 'p-1', { sortOrder: 1 });
    await seedTask('task-1', { projectId: 'p-1', createdAt: createdAt(1) });
    await seedTask('task-2', { projectId: 'p-1', createdAt: createdAt(2), headingId: 'h-1' });

    await h.headings.reorder(USER, {
      projectId: 'p-1',
      ungroupedTaskIds: ['task-2'],
      groups: [
        { headingId: 'h-2', taskIds: ['task-1'] },
        { headingId: 'h-1', taskIds: [] },
      ],
    });
    const headings = await testPrisma.projectHeading.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(headings.map((heading) => heading.id)).toEqual(['h-2', 'h-1']);
    const t1 = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
    const t2 = await testPrisma.task.findUniqueOrThrow({ where: { id: 'task-2' } });
    // 视觉顺序（ungrouped 在前：task-2 为 0，h-2 分组的 task-1 为 1）决定 position
    expect([t1.headingId, t1.sortOrder, t1.position]).toEqual([
      'h-2',
      0,
      synthPosition(1, createdAt(1)),
    ]);
    expect([t2.headingId, t2.sortOrder, effectivePosition(t2)]).toEqual([
      null,
      0,
      synthPosition(0, createdAt(2)),
    ]);
    await expectLoggedAsStored('task', 'task-1');
    await expectLoggedAsStored('project-heading', 'h-2');

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
    expect([first.sortOrder, second.sortOrder]).toEqual([0, 1]);
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
    expect(
      (await testPrisma.area.findMany({ orderBy: { sortOrder: 'asc' } })).map((area) => area.id),
    ).toEqual([second.id, first.id]);
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
    expect(group).toMatchObject({ title: '上下文', sortOrder: 0, tags: [] });
    const tag = await h.tags.create(USER, { title: '电脑', tagGroupId: group.id });
    expect(tag).toMatchObject({ color: '#3B82F6', tagGroupId: group.id, sortOrder: 0 });
    expect(tag.position).toBe(synthPosition(0, tag.createdAt));
    const colored = await h.tags.create(USER, { title: '电话', color: '#EF4444' });
    expect(colored.color).toBe('#EF4444');

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
