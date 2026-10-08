/**
 * 领域规则（src/domain）：契约夹具在纯函数上的结果，以及各写入规则。
 * 设备 Engine 后端（api 包）与 hub REST 服务（backend 包）各有一份同一
 * 夹具的契约测试。
 */

import { describe, expect, it } from 'vitest';

import {
  HeadingLayoutMismatchError,
  buildRepeatPreviews,
  buildTagTree,
  countProjectTasks,
  deriveAttachmentId,
  deriveRepeatInstanceId,
  deriveSubtaskId,
  effectiveProjectTagIds,
  effectiveTaskTagIds,
  feedIncludesProjects,
  hasSearchCriteria,
  planConvertTaskToProject,
  planEmptyTrash,
  planHeadingArchive,
  planHeadingDelete,
  planHeadingLayout,
  planReorder,
  positionAfterRow,
  positionAtEnd,
  positionAtStart,
  planProjectRestore,
  planProjectTrash,
  planRepeatInstance,
  planRepeatSkip,
  planTaskComplete,
  planTaskCreate,
  planTaskSearch,
  planTaskUpdate,
  projectMatchesView,
  projectUpdatePutsBack,
  repeatDerivationTarget,
  sortFeedItems,
  sortForView,
  tagHit,
  tagParentCreatesCycle,
  tagParentsFrom,
  taskMatchesQuery,
  taskMatchesView,
  taskRestorePatch,
  taskSearchRank,
  type ListView,
} from '../src/index';
import { SEARCH_CONTRACT, VIEW_CONTRACT } from '../src/testing';

const UTC = { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };

describe('视图契约（纯函数）', () => {
  const context = { ...VIEW_CONTRACT.zones, now: new Date(VIEW_CONTRACT.now) };
  const parents = tagParentsFrom(
    new Map(VIEW_CONTRACT.projects.map((project) => [project.id, project])),
    new Map(VIEW_CONTRACT.areas.map((area) => [area.id, area])),
    VIEW_CONTRACT.tags,
  );

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
    const visible = VIEW_CONTRACT.tasks.filter((task) =>
      taskMatchesQuery(task, query, context, parents),
    );
    expect(sortForView(visible, query.view, (task) => task.settledAt).map((t) => t.id)).toEqual(
      ids,
    );
  });
});

describe('有效 Tag（ADR 0015）', () => {
  const parents = tagParentsFrom(
    new Map([
      ['p-1', { areaId: 'area-1', tagIds: ['work'] }],
      ['p-2', { areaId: null, tagIds: [] }],
    ]),
    new Map([
      ['area-1', { tagIds: ['home', 'work'] }],
      ['area-2', { tagIds: ['errand'] }],
    ]),
    [{ id: 'life' }, { id: 'home', parentId: 'life' }, { id: 'errand', parentId: 'home' }],
  );

  it('Task：自身 ∪ Project ∪ Project 所属 Area，去重', () => {
    expect(
      effectiveTaskTagIds({ tagIds: ['focus'], projectId: 'p-1', areaId: null }, parents),
    ).toEqual(['focus', 'work', 'home']);
  });

  it('Task：直接归属的 Area', () => {
    expect(effectiveTaskTagIds({ tagIds: [], projectId: null, areaId: 'area-2' }, parents)).toEqual(
      ['errand'],
    );
  });

  it('Task：找不到的 Project / Area 不贡献 Tag', () => {
    expect(
      effectiveTaskTagIds({ tagIds: ['focus'], projectId: 'gone', areaId: 'gone' }, parents),
    ).toEqual(['focus']);
  });

  it('Project：自身 ∪ 所属 Area', () => {
    expect(effectiveProjectTagIds({ tagIds: ['x'], areaId: 'area-2' }, parents)).toEqual([
      'x',
      'errand',
    ]);
  });

  it('tagHit：命中 Tag 的整棵子树，不展开祖先', () => {
    expect(tagHit(['errand'], 'life', parents)).toBe(true);
    expect(tagHit(['home'], 'home', parents)).toBe(true);
    expect(tagHit(['life'], 'home', parents)).toBe(false);
    expect(tagHit(['x'], 'unknown', parents)).toBe(false);
    expect(tagHit(['unknown'], 'unknown', parents)).toBe(true);
  });

  it('tagId 查询缺少 parents 时报错', () => {
    expect(() =>
      taskMatchesQuery(
        VIEW_CONTRACT.tasks[0]!,
        { tagId: 'tag-1' },
        {
          ...VIEW_CONTRACT.zones,
          now: new Date(VIEW_CONTRACT.now),
        },
      ),
    ).toThrow();
  });
});

describe('嵌套 Tag 树（ADR-0016）', () => {
  it('子树、祖先、子 Tag 保持输入顺序', () => {
    const tree = buildTagTree([
      { id: 'work', parentId: null },
      { id: 'meeting', parentId: 'work' },
      { id: 'weekly', parentId: 'meeting' },
      { id: 'travel', parentId: 'work' },
      { id: 'urgent' },
    ]);
    expect(tree.childrenOf(null)).toEqual(['work', 'urgent']);
    expect(tree.childrenOf('work')).toEqual(['meeting', 'travel']);
    expect([...tree.descendantsOf('work')].sort()).toEqual(
      ['meeting', 'travel', 'weekly', 'work'].sort(),
    );
    expect(tree.ancestorsOf('weekly')).toEqual(['meeting', 'work']);
    expect(tree.parentOf('urgent')).toBeNull();
  });

  it('自指与悬空的父 Tag 按顶层处理', () => {
    const tree = buildTagTree([
      { id: 'a', parentId: 'a' },
      { id: 'b', parentId: 'deleted' },
    ]);
    expect(tree.childrenOf(null)).toEqual(['a', 'b']);
    expect(tree.ancestorsOf('b')).toEqual([]);
  });

  it('环：环上 id 最小的视作顶层，结果与输入顺序无关', () => {
    const rows = [
      { id: 'c', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'a', parentId: 'c' },
      { id: 'd', parentId: 'c' },
    ];
    for (const input of [rows, [...rows].reverse()]) {
      const tree = buildTagTree(input);
      expect(tree.parentOf('a')).toBeNull();
      expect(tree.ancestorsOf('d')).toEqual(['c', 'b', 'a']);
      expect(tree.descendantsOf('a').size).toBe(4);
    }
  });

  it('改父 Tag 是否成环', () => {
    const parents: Record<string, string | null> = { meeting: 'work', weekly: 'meeting' };
    const parentOf = (id: string) => parents[id];
    expect(tagParentCreatesCycle('work', 'weekly', parentOf)).toBe(true);
    expect(tagParentCreatesCycle('work', 'work', parentOf)).toBe(true);
    expect(tagParentCreatesCycle('weekly', 'work', parentOf)).toBe(false);
    expect(tagParentCreatesCycle('work', null, parentOf)).toBe(false);
    // 现有数据里的环不会让它死循环
    expect(tagParentCreatesCycle('x', 'p', (id) => ({ p: 'q', q: 'p' })[id])).toBe(false);
  });
});

describe('任务搜索（纯函数）', () => {
  const searchParents = tagParentsFrom(
    new Map(),
    new Map(SEARCH_CONTRACT.areas.map((area) => [area.id, area])),
    SEARCH_CONTRACT.tags,
  );

  it.each(SEARCH_CONTRACT.cases)('契约 q=$q extended=$extended tagIds=$tagIds', (contract) => {
    const { q, extended, tagIds, hits } = contract;
    const result = planTaskSearch(
      SEARCH_CONTRACT.tasks,
      SEARCH_CONTRACT.subtasks,
      q,
      { extended, tagIds },
      searchParents,
    );
    expect(
      result.map((hit) => ({ id: hit.task.id, subtasks: hit.matchedSubtasks.map((s) => s.id) })),
    ).toEqual(hits);
  });

  it('Tag 条件缺少 parents 时报错；没有搜索词也没有 Tag 时不搜索', () => {
    expect(() => planTaskSearch(SEARCH_CONTRACT.tasks, [], '', { tagIds: ['st-home'] })).toThrow();
    expect(hasSearchCriteria('  ', { tagIds: [] })).toBe(false);
    expect(hasSearchCriteria('', { tagIds: ['x'] })).toBe(true);
    expect(hasSearchCriteria('milk')).toBe(true);
  });

  it('相关度档位', () => {
    expect(taskSearchRank({ title: 'Milk tea', notes: null }, false, 'milk')).toBe('titlePrefix');
    expect(taskSearchRank({ title: 'Buy milk', notes: null }, false, 'milk')).toBe('title');
    expect(taskSearchRank({ title: 'Buy', notes: 'milk' }, false, 'milk')).toBe('other');
    expect(taskSearchRank({ title: 'Buy', notes: null }, true, 'milk')).toBe('other');
    expect(taskSearchRank({ title: 'Buy', notes: null }, false, 'milk')).toBeNull();
    expect(taskSearchRank({ title: 'Buy', notes: null }, true, '')).toBeNull();
  });

  it('已取消的任务只在扩展范围内', () => {
    const cancelled = { ...SEARCH_CONTRACT.tasks[0], id: 'c', status: 'CANCELLED' };
    expect(planTaskSearch([cancelled], [], 'milk')).toEqual([]);
    expect(
      planTaskSearch([cancelled], [], 'milk', { extended: true }).map((h) => h.task.id),
    ).toEqual(['c']);
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

  it('Trash 中编辑：改日期 / 归属 / 标签放回；改标题 / 备注不放回', () => {
    const trashed = { ...base, trashedAt: '2026-09-20T00:00:00.000Z' };
    expect(planTaskUpdate(trashed, { dueDate: '2026-10-01' }, UTC)).toMatchObject({
      trashedAt: null,
    });
    expect(planTaskUpdate(trashed, { projectId: 'p2' }, UTC)).toMatchObject({ trashedAt: null });
    expect(planTaskUpdate(trashed, { tagIds: ['t1'] }, UTC)).toMatchObject({ trashedAt: null });
    expect(planTaskUpdate(trashed, { title: 'y', notes: 'n' }, UTC)).toEqual({
      title: 'y',
      notes: 'n',
    });
    // 不在 Trash：不写 trashedAt
    expect(planTaskUpdate(base, { dueDate: '2026-10-01' }, UTC)).not.toHaveProperty('trashedAt');
  });

  it('放回只清 trashedAt：了结状态保留', () => {
    expect(taskRestorePatch()).toEqual({ trashedAt: null });
  });

  it('Trash 中编辑项目：改日期 / 区域 / 标签放回；改标题 / 备注不放回', () => {
    expect(projectUpdatePutsBack({ scheduledDate: '2026-10-01' })).toBe(true);
    expect(projectUpdatePutsBack({ areaId: null })).toBe(true);
    expect(projectUpdatePutsBack({ tagIds: [] })).toBe(true);
    expect(projectUpdatePutsBack({ title: 'y', notes: 'n' })).toBe(false);
  });

  it('已完成的任务再次完成：不做任何事（不刷新了结时间、不二次派生）', () => {
    expect(planTaskComplete('COMPLETED', '2026-09-24T00:00:00.000Z')).toBeNull();
    expect(planTaskComplete('CANCELLED', '2026-09-24T00:00:00.000Z')).toMatchObject({
      patch: { status: 'COMPLETED', reminderTime: null },
      deriveRepeat: true,
    });
  });

  it('Inbox（CONTEXT：Inbox）：获得归属即离开；带归属新建不落 Inbox', () => {
    const inbox = {
      ...base,
      scheduledType: 'NONE',
      scheduledDate: null,
      bucket: 'INBOX',
      projectId: null,
      headingId: null,
    };
    expect(planTaskUpdate(inbox, { projectId: 'p1' }, UTC)).toEqual({
      projectId: 'p1',
      bucket: 'ANYTIME',
      reminderTime: null,
      repeatRule: null,
    });
    expect(planTaskUpdate(inbox, { areaId: 'a1' }, UTC)).toMatchObject({ bucket: 'ANYTIME' });
    expect(
      planTaskCreate({ title: 'x', bucket: 'INBOX' as never, projectId: 'p1' }, UTC),
    ).toMatchObject({
      bucket: 'ANYTIME',
    });
    // 清空归属不会自动回 Inbox：Anytime 是用户选择，移入 Inbox 需显式指定
    expect(
      planTaskUpdate({ ...inbox, bucket: 'ANYTIME', areaId: 'a1' }, { areaId: null }, UTC),
    ).toEqual({
      areaId: null,
      reminderTime: null,
      repeatRule: null,
    });
  });

  it('移入 Inbox：清除归属与计划（日期、提醒、重复规则），解除分组', () => {
    expect(
      planTaskUpdate(
        base,
        { projectId: null, areaId: null, bucket: 'INBOX' as never, scheduledType: 'NONE' as never },
        UTC,
      ),
    ).toEqual({
      scheduledType: 'NONE',
      scheduledDate: null,
      reminderTime: null,
      repeatRule: null,
      bucket: 'INBOX',
      projectId: null,
      areaId: null,
      headingId: null,
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
      { today: '2026-09-21', defaultInterval: { unit: 'day', count: 3 } },
    );
    expect(plan.project).toMatchObject({
      bucket: 'ANYTIME',
      status: 'COMPLETED',
      completedAt: '2026-09-20T00:00:00.000Z',
      areaId: 'area-parent',
      tagIds: ['tag-1'],
      reviewInterval: { unit: 'day', count: 3 },
      nextReviewDate: '2026-09-24',
    });
    // 提升的任务属于新项目，不在 Inbox
    expect(plan.promotedTasks[0]).toMatchObject({
      title: 's',
      bucket: 'ANYTIME',
      status: 'ACTIVE',
    });
  });

  it('重复实例：确定性 id 与字段；子任务按 Position，沿用原 Position', () => {
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
      { title: 'b', position: 'a2' },
      { title: 'a-old', position: 'a1' },
      { title: 'a-new', position: 'a0' },
    ];
    const plan = planRepeatInstance(parent, subtasks, '2026-09-24T08:00:00.000Z', UTC)!;
    expect(plan.task).toMatchObject({
      scheduledDate: '2026-09-25',
      reminderTime: '09:00',
      repeatSourceId: 'task-1',
    });
    expect(plan.subtasksFor(plan.id).map((s) => s.title)).toEqual(['a-new', 'a-old', 'b']);
    expect(plan.subtasksFor(plan.id).map((s) => s.position)).toEqual(['a0', 'a1', 'a2']);
    expect(planRepeatInstance({ ...parent, repeatRule: null }, [], 'x', UTC)).toBeNull();
  });

  it('重复实例：附件按 Position 复制，指向同一 Blob，id 按序号确定', () => {
    const parent = {
      id: 'task-1',
      title: '月报',
      notes: null,
      scheduledDate: '2026-09-24',
      repeatRule: { unit: 'month', interval: 1, anchor: 'scheduled' } as const,
      reminderTime: null,
      projectId: null,
      headingId: null,
      areaId: null,
      tagIds: [],
    };
    const attachments = [
      {
        name: '数据.xlsx',
        mimeType: 'application/vnd.ms-excel',
        size: 9,
        blobHash: 'b',
        position: 'a1',
      },
      { name: '模板.docx', mimeType: 'application/msword', size: 7, blobHash: 'a', position: 'a0' },
    ];
    const plan = planRepeatInstance(parent, [], '2026-09-24T08:00:00.000Z', UTC, attachments)!;
    const copies = plan.attachmentsFor(plan.id);
    expect(
      copies.map(({ name, blobHash, taskId, position }) => [name, blobHash, taskId, position]),
    ).toEqual([
      ['模板.docx', 'a', plan.id, 'a0'],
      ['数据.xlsx', 'b', plan.id, 'a1'],
    ]);
    expect(copies.map((copy) => copy.id)).toEqual([
      deriveAttachmentId(plan.id, 0),
      deriveAttachmentId(plan.id, 1),
    ]);
    // 与 Subtask 不同命名空间：同序号不撞 id
    expect(deriveAttachmentId(plan.id, 0)).not.toBe(deriveSubtaskId(plan.id, 0));
    expect(
      planRepeatInstance(parent, [], '2026-09-24T08:00:00.000Z', UTC)!.attachmentsFor('x'),
    ).toEqual([]);
  });

  it('跳过本次：计划日推进、截止日同步平移；各不可跳过条件', () => {
    const now = '2026-02-10T08:00:00.000Z';
    const task = {
      status: 'ACTIVE',
      trashedAt: null,
      scheduledType: 'DATE',
      scheduledDate: '2026-02-05',
      dueDate: '2026-02-07',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' } as const,
    };
    expect(planRepeatSkip(task, false, now, UTC)).toEqual({
      patch: { scheduledDate: '2026-02-10', dueDate: '2026-02-12' },
    });
    // Postgres 存储形态（UTC 零点 Date）同样适用；无截止日不写 dueDate
    expect(
      planRepeatSkip(
        { ...task, scheduledDate: new Date('2026-02-12T00:00:00Z'), dueDate: null },
        false,
        now,
        UTC,
      ),
    ).toEqual({ patch: { scheduledDate: '2026-02-13' } });

    expect(planRepeatSkip({ ...task, repeatRule: null }, false, now, UTC)).toEqual({
      blocked: 'not-repeating',
    });
    expect(planRepeatSkip({ ...task, scheduledType: 'SOMEDAY' }, false, now, UTC)).toEqual({
      blocked: 'not-repeating',
    });
    expect(planRepeatSkip({ ...task, status: 'COMPLETED' }, false, now, UTC)).toEqual({
      blocked: 'not-active',
    });
    expect(planRepeatSkip({ ...task, trashedAt: now }, false, now, UTC)).toEqual({
      blocked: 'not-active',
    });
    expect(planRepeatSkip(task, true, now, UTC)).toEqual({ blocked: 'next-exists' });
    expect(
      planRepeatSkip(
        { ...task, repeatRule: { ...task.repeatRule, until: '2026-02-09' } },
        false,
        now,
        UTC,
      ),
    ).toEqual({ blocked: 'no-next' });
  });

  it('派生落地决策：已有关联实例或确定性 id 存活 → 跳过；在 Trash / 已 compact → 换新 id', () => {
    const decide = (
      hasLinkedInstance: boolean,
      plannedId: Parameters<typeof repeatDerivationTarget>[0]['plannedId'],
    ) => repeatDerivationTarget({ hasLinkedInstance, plannedId });
    expect(decide(false, 'absent')).toBe('planned');
    expect(decide(true, 'absent')).toBe('skip'); // anchor=completion 换日再完成
    expect(decide(false, 'live')).toBe('skip'); // 并发派生 / 存量实例
    expect(decide(false, 'trashed')).toBe('fresh');
    expect(decide(false, 'compacted')).toBe('fresh');
    expect(decide(true, 'trashed')).toBe('skip');
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
      headingOrder: ['h1'],
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

describe('下次预告（Repeat Preview）', () => {
  // 今天 = 2026-02-10（UTC）
  const context = { ...UTC, now: new Date('2026-02-10T08:00:00.000Z') };
  const daily = { unit: 'day', interval: 1, anchor: 'scheduled' } as const;
  const source = (id: string, patch: Record<string, unknown> = {}) => ({
    id,
    title: id,
    status: 'ACTIVE',
    trashedAt: null,
    scheduledType: 'DATE',
    scheduledDate: '2026-02-10',
    repeatRule: daily,
    repeatSourceId: null,
    projectId: null,
    areaId: null,
    ...patch,
  });

  it('每条链投影下一次，按日期排序', () => {
    expect(
      buildRepeatPreviews(
        [
          source('weekly', { repeatRule: { ...daily, unit: 'week' } }),
          source('daily'),
          // Postgres 存储形态（UTC 零点 Date）同样适用
          source('stored', { scheduledDate: new Date('2026-02-12T00:00:00Z') }),
        ],
        context,
      ).map((p) => [p.sourceTaskId, p.dateKey]),
    ).toEqual([
      ['daily', '2026-02-11'],
      ['stored', '2026-02-13'],
      ['weekly', '2026-02-17'],
    ]);
  });

  it('不投影：已了结 / Trash / 非 DATE / 无规则 / completion 锚点 / 链终结 / 下一次不晚于今天', () => {
    expect(
      buildRepeatPreviews(
        [
          source('done', { status: 'COMPLETED' }),
          source('trashed', { trashedAt: '2026-02-09T00:00:00.000Z' }),
          source('someday', { scheduledType: 'SOMEDAY' }),
          source('plain', { repeatRule: null }),
          source('gap', { repeatRule: { ...daily, anchor: 'completion' } }),
          source('ended', { repeatRule: { ...daily, until: '2026-02-10' } }),
          source('overdue', { scheduledDate: '2026-02-05' }),
        ],
        context,
      ),
    ).toEqual([]);
  });

  it('下一次已派生（repeatSourceId 或存量确定性 id）则不投影；实例在 Trash 不算', () => {
    const legacyId = deriveRepeatInstanceId('legacy', daily, '2026-02-11');
    expect(
      buildRepeatPreviews(
        [
          source('linked'),
          source('instance', { scheduledDate: '2026-02-11', repeatSourceId: 'linked' }),
          source('legacy'),
          source(legacyId, { scheduledDate: '2026-02-11', status: 'COMPLETED' }),
          source('discarded'),
          source('discarded-next', {
            repeatSourceId: 'discarded',
            trashedAt: '2026-02-10T00:00:00.000Z',
          }),
        ],
        context,
      ).map((p) => p.sourceTaskId),
    ).toEqual(['discarded', 'instance']);
  });
});

describe('排序位次（retire-sort-order）', () => {
  const rows = [
    { id: 'a', position: 'a0' },
    { id: 'b', position: 'a1' },
    { id: 'c', position: 'a2' },
  ];

  it('新建：追加到末尾 / 置顶 / 插在某行之后', () => {
    expect(positionAtEnd(rows) > 'a2').toBe(true);
    expect(positionAtStart(rows) < 'a0').toBe(true);
    const between = positionAfterRow(rows, 'a');
    expect(between > 'a0' && between < 'a1').toBe(true);
    expect(positionAfterRow(rows, 'missing') > 'a2').toBe(true);
    expect(positionAtEnd([])).toBe('a0');
  });

  it('空 Position 只是防御：排在最前，不参与插入邻居', () => {
    const rows = [
      { id: 'x', position: 'a1' },
      { id: 'y', position: null },
    ];
    expect(sortForView(rows, undefined).map((r) => r.id)).toEqual(['y', 'x']);
    expect(positionAtStart(rows) < 'a1').toBe(true);
    expect(positionAfterRow(rows, 'y') < 'a1').toBe(true);
  });

  it('重排：只给被移动的行分配 Position', () => {
    const changes = planReorder(rows, ['b', 'c', 'a']);
    expect(changes.map(({ id }) => id)).toEqual(['a']);
    expect(changes[0].patch.position > 'a2').toBe(true);
  });

  it('重排：顺序未变不产生写；未知 id 忽略', () => {
    expect(planReorder(rows, ['a', 'ghost', 'b', 'c'])).toEqual([]);
  });
});
