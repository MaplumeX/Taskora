/**
 * 领域规则（src/domain）：契约夹具在纯函数上的结果，以及各写入规则。
 * 设备 Engine 后端（api 包）与 hub REST 服务（backend 包）各有一份同一
 * 夹具的契约测试。
 */

import { describe, expect, it } from 'vitest';

import {
  HeadingLayoutMismatchError,
  countProjectTasks,
  feedIncludesProjects,
  planConvertTaskToProject,
  planEmptyTrash,
  planHeadingArchive,
  planHeadingDelete,
  planHeadingLayout,
  planProjectRestore,
  planProjectTrash,
  planRepeatInstance,
  planTaskComplete,
  planTaskCreate,
  planTaskUpdate,
  projectMatchesView,
  sortFeedItems,
  sortForView,
  taskMatchesQuery,
  taskMatchesView,
  type ListView,
} from '../src/index';
import { VIEW_CONTRACT } from '../src/testing';

const UTC = { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };

describe('视图契约（纯函数）', () => {
  const context = { ...VIEW_CONTRACT.zones, now: new Date(VIEW_CONTRACT.now) };

  it.each(Object.entries(VIEW_CONTRACT.feeds))('feed %s', (view, expected) => {
    const listView = view as ListView;
    const tasks = VIEW_CONTRACT.tasks.filter((task) => taskMatchesView(task, listView, context));
    const projects = feedIncludesProjects(listView)
      ? VIEW_CONTRACT.projects.filter((project) => projectMatchesView(project, listView, context))
      : [];
    const items = [...tasks.map((task) => ({ ...task, completedAt: task.settledAt })), ...projects];
    expect(sortFeedItems(items, listView).map((item) => item.id)).toEqual(expected);
  });

  it('项目进度计数', () => {
    const ids = Object.keys(VIEW_CONTRACT.projectCounts);
    expect(Object.fromEntries(countProjectTasks(ids, VIEW_CONTRACT.tasks))).toEqual(
      VIEW_CONTRACT.projectCounts,
    );
  });

  it.each(VIEW_CONTRACT.queries)('tasks $query', ({ query, ids }) => {
    const visible = VIEW_CONTRACT.tasks.filter((task) => taskMatchesQuery(task, query, context));
    expect(sortForView(visible, query.view, (task) => task.settledAt).map((t) => t.id)).toEqual(
      ids,
    );
  });
});

describe('任务写入规则', () => {
  const base = {
    scheduledType: 'DATE',
    scheduledDate: '2026-09-24',
    bucket: 'SCHEDULED',
    projectId: 'p1',
    areaId: null,
    headingId: 'h1',
  };

  it('新建：DATE 才带日期；bucket 按归属推导', () => {
    expect(planTaskCreate({ title: 'x', projectId: 'p1' }, UTC)).toMatchObject({
      scheduledType: 'NONE',
      scheduledDate: null,
      bucket: 'ANYTIME',
      status: 'ACTIVE',
      reminderTime: null,
      repeatRule: null,
    });
    expect(
      planTaskCreate(
        { title: 'x', scheduledType: 'SOMEDAY' as never, scheduledDate: '2026-09-24' },
        UTC,
      ),
    ).toMatchObject({ scheduledDate: null, bucket: 'SCHEDULED' });
  });

  it('离开 DATE：清除日期、提醒与重复规则，bucket 回落', () => {
    expect(planTaskUpdate(base, { scheduledType: 'NONE' as never }, UTC)).toEqual({
      scheduledType: 'NONE',
      scheduledDate: null,
      reminderTime: null,
      repeatRule: null,
      bucket: 'ANYTIME',
    });
  });

  it('换日期保留提醒；只改标题不碰 bucket', () => {
    expect(planTaskUpdate(base, { scheduledDate: '2026-10-01T00:00:00.000Z' }, UTC)).toEqual({
      scheduledType: 'DATE',
      scheduledDate: '2026-10-01',
      bucket: 'SCHEDULED',
    });
    expect(planTaskUpdate(base, { title: 'y' }, UTC)).toEqual({ title: 'y' });
  });

  it('换项目解除分组；非法重复规则被忽略', () => {
    expect(planTaskUpdate(base, { projectId: 'p2' }, UTC)).toEqual({
      projectId: 'p2',
      headingId: null,
    });
    expect(planTaskUpdate(base, { repeatRule: { unit: 'bogus' } as never }, UTC)).toEqual({});
  });

  it('已完成的任务再次完成：不做任何事（不刷新了结时间、不二次派生）', () => {
    expect(planTaskComplete('COMPLETED', '2026-09-24T00:00:00.000Z')).toBeNull();
    expect(planTaskComplete('CANCELLED', '2026-09-24T00:00:00.000Z')).toMatchObject({
      patch: { status: 'COMPLETED', reminderTime: null },
      deriveRepeat: true,
    });
  });

  it('转项目：bucket 按计划类型推导（Inbox 任务得到 Anytime 项目）', () => {
    const plan = planConvertTaskToProject(
      {
        title: 't',
        notes: null,
        scheduledType: 'NONE',
        scheduledDate: null,
        dueDate: null,
        status: 'COMPLETED',
        settledAt: '2026-09-20T00:00:00.000Z',
        trashedAt: null,
        areaId: null,
        tagIds: ['tag-1'],
      },
      'area-parent',
      [{ title: 's', status: 'ACTIVE', settledAt: null }],
      UTC,
    );
    expect(plan.project).toMatchObject({
      bucket: 'ANYTIME',
      status: 'COMPLETED',
      completedAt: '2026-09-20T00:00:00.000Z',
      areaId: 'area-parent',
      tagIds: ['tag-1'],
    });
    expect(plan.promotedTasks[0]).toMatchObject({ title: 's', bucket: 'INBOX', status: 'ACTIVE' });
  });

  it('重复实例：确定性 id 与字段；子任务按 sortOrder、平局后建在前', () => {
    const parent = {
      id: 'task-1',
      title: 'Water plants',
      notes: null,
      scheduledDate: '2026-09-24',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' } as const,
      reminderTime: '09:00',
      projectId: null,
      headingId: null,
      areaId: null,
      tagIds: [],
    };
    const subtasks = [
      { title: 'b', sortOrder: 1, createdAt: '2026-01-01T00:00:00Z' },
      { title: 'a-old', sortOrder: 0, createdAt: '2026-01-01T00:00:00Z' },
      { title: 'a-new', sortOrder: 0, createdAt: '2026-01-02T00:00:00Z' },
    ];
    const plan = planRepeatInstance(parent, subtasks, '2026-09-24T08:00:00.000Z', UTC)!;
    expect(plan.task).toMatchObject({ scheduledDate: '2026-09-25', reminderTime: '09:00' });
    expect(plan.subtasksFor(plan.id).map((s) => s.title)).toEqual(['a-new', 'a-old', 'b']);
    expect(planRepeatInstance({ ...parent, repeatRule: null }, [], 'x', UTC)).toBeNull();
  });
});

describe('级联规则', () => {
  const now = '2026-09-24T00:00:00.000Z';

  it('项目进 Trash：已在 Trash 的任务不动；恢复只捡回同一时刻进去的', () => {
    const trash = planProjectTrash(now, [
      { id: 'a', trashedAt: null },
      { id: 'b', trashedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    expect(trash.tasks.map((t) => t.id)).toEqual(['a']);
    expect(trash.tasks[0].patch).toEqual({ trashedAt: now, reminderTime: null });

    // 时间戳按时刻比较：Date 与 ISO 字符串等价
    const restore = planProjectRestore(new Date(now), [
      { id: 'a', trashedAt: now },
      { id: 'b', trashedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    expect(restore.tasks).toEqual([{ id: 'a', patch: { trashedAt: null } }]);
  });

  it('清空 Trash：Trash 里的任务与项目，及 Trash 项目下的全部任务', () => {
    expect(
      planEmptyTrash(
        [
          { id: 'p1', trashedAt: now },
          { id: 'p2', trashedAt: null },
        ],
        [
          { id: 't1', projectId: 'p1', trashedAt: null },
          { id: 't2', projectId: 'p2', trashedAt: null },
          { id: 't3', projectId: null, trashedAt: now },
        ],
      ),
    ).toEqual({ taskIds: ['t1', 't3'], projectIds: ['p1'] });
  });

  it('分组：删除只把外面的任务放进 Trash；归档只完成未了结且不在 Trash 的', () => {
    const tasks = [
      { id: 'active', status: 'ACTIVE', trashedAt: null },
      { id: 'done', status: 'COMPLETED', trashedAt: null },
      { id: 'gone', status: 'ACTIVE', trashedAt: now },
    ];
    expect(planHeadingDelete(now, tasks).map((t) => t.id)).toEqual(['active', 'done']);
    expect(planHeadingArchive(now, tasks).tasks.map((t) => t.id)).toEqual(['active']);
  });

  it('布局：参与者必须恰好匹配；目标状态含视觉顺序', () => {
    const layout = {
      ungroupedTaskIds: ['t2'],
      groups: [{ headingId: 'h1', taskIds: ['t1'] }],
    };
    expect(planHeadingLayout(layout, ['h1'], ['t1', 't2'])).toEqual({
      headingOrder: [{ id: 'h1', sortOrder: 0 }],
      taskHeading: [
        { id: 't2', headingId: null },
        { id: 't1', headingId: 'h1' },
      ],
      visualTaskIds: ['t2', 't1'],
    });
    expect(() => planHeadingLayout(layout, ['h1'], ['t1'])).toThrow(HeadingLayoutMismatchError);
    expect(() =>
      planHeadingLayout({ ...layout, ungroupedTaskIds: ['t1'] }, ['h1'], ['t1', 't2']),
    ).toThrow('Duplicate task id');
  });
});
