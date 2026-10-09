/**
 * 领域规则契约夹具（local-first-v3 issue 04）：同一组数据与期望结果，
 * 由三方各跑一遍——engine 的 domain 纯函数、设备的 Engine 后端（api
 * 包）、hub 的 REST 服务（backend 包）。任何一方的读路径偏离规则，
 * 对应的契约测试就会失败。
 *
 * 数据是 wire 形态（日历日期为日期键，时间戳为 ISO 字符串）；各方自行
 * 换成存储形态。期望的 id 列表带顺序。
 */

import type { ListView, TaskListQuery } from '../domain';

export interface ContractTask {
  id: string;
  title: string;
  notes: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  scheduledType: 'NONE' | 'DATE' | 'SOMEDAY';
  scheduledDate: string | null;
  dueDate: string | null;
  bucket: 'INBOX' | 'ANYTIME' | 'SCHEDULED';
  settledAt: string | null;
  trashedAt: string | null;
  projectId: string | null;
  areaId: string | null;
  tagIds: string[];
  position: string;
  createdAt: string;
}

export interface ContractProject {
  id: string;
  title: string;
  status: 'ACTIVE' | 'COMPLETED';
  scheduledType: 'NONE' | 'DATE' | 'SOMEDAY';
  scheduledDate: string | null;
  dueDate: string | null;
  bucket: 'ANYTIME' | 'SCHEDULED';
  completedAt: string | null;
  trashedAt: string | null;
  areaId: string | null;
  tagIds: string[];
  position: string;
  createdAt: string;
}

export interface ContractArea {
  id: string;
  title: string;
  tagIds: string[];
  position: string;
  createdAt: string;
}

const CREATED = '2026-09-01T00:00:00.000Z';

function task(id: string, position: string, fields: Partial<ContractTask> = {}): ContractTask {
  return {
    id,
    title: id,
    notes: null,
    status: 'ACTIVE',
    scheduledType: 'NONE',
    scheduledDate: null,
    dueDate: null,
    bucket: 'INBOX',
    settledAt: null,
    trashedAt: null,
    projectId: null,
    areaId: null,
    tagIds: [],
    position,
    createdAt: CREATED,
    ...fields,
  };
}

function project(
  id: string,
  position: string,
  fields: Partial<ContractProject> = {},
): ContractProject {
  return {
    id,
    title: id,
    status: 'ACTIVE',
    scheduledType: 'NONE',
    scheduledDate: null,
    dueDate: null,
    bucket: 'ANYTIME',
    completedAt: null,
    trashedAt: null,
    areaId: null,
    tagIds: [],
    position,
    createdAt: CREATED,
    ...fields,
  };
}

export const VIEW_CONTRACT = {
  /** 账号在上海：UTC 9-23 17:00 已是当地 9-24 凌晨——「今天」不能按 UTC 算。 */
  zones: { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' },
  now: '2026-09-23T17:00:00.000Z',
  /** 嵌套 Tag（ADR-0016）：tag-0 是 tag-1、tag-2 的父 Tag。父 Tag 排在前面（外键顺序）。 */
  tags: [
    { id: 'tag-0', title: 'Mind', parentId: null },
    { id: 'tag-1', title: 'Focus', parentId: 'tag-0' },
    { id: 'tag-2', title: 'Work', parentId: 'tag-0' },
    { id: 'tag-3', title: 'Home', parentId: null },
  ],
  /** 有效 Tag（ADR 0015）：area-1 的 Tag 经直接归属或所属 Project 继承。 */
  areas: [
    { id: 'area-1', title: 'area-1', tagIds: ['tag-3'], position: 'a0', createdAt: CREATED },
  ] satisfies ContractArea[],
  tasks: [
    task('t-inbox', 'a0'),
    task('t-anytime', 'a1', { bucket: 'ANYTIME', projectId: 'p-active', tagIds: ['tag-1'] }),
    task('t-today', 'a2', {
      scheduledType: 'DATE',
      scheduledDate: '2026-09-24',
      bucket: 'SCHEDULED',
    }),
    task('t-overdue', 'a3', {
      scheduledType: 'DATE',
      scheduledDate: '2026-09-20',
      bucket: 'SCHEDULED',
    }),
    task('t-upcoming', 'a4', {
      scheduledType: 'DATE',
      scheduledDate: '2026-09-25',
      bucket: 'SCHEDULED',
    }),
    task('t-someday', 'a5', {
      scheduledType: 'SOMEDAY',
      bucket: 'SCHEDULED',
      areaId: 'area-1',
      notes: 'search in notes',
    }),
    task('t-done', 'a6', {
      status: 'COMPLETED',
      dueDate: '2026-09-20',
      settledAt: '2026-09-22T10:00:00.000Z',
      bucket: 'ANYTIME',
      projectId: 'p-active',
    }),
    task('t-cancelled', 'a7', {
      title: 'Search me',
      status: 'CANCELLED',
      settledAt: '2026-09-23T10:00:00.000Z',
    }),
    task('t-trashed', 'a8', { trashedAt: '2026-09-21T00:00:00.000Z', dueDate: '2026-09-20' }),
    task('t-in-p-today', 'a9', { bucket: 'ANYTIME', projectId: 'p-today' }),
    // 截止日期 ≤ 今天也进 Today，同时留在原视图
    task('t-due-inbox', 'b0', { dueDate: '2026-09-24' }),
    task('t-due-someday', 'b1', {
      scheduledType: 'SOMEDAY',
      bucket: 'SCHEDULED',
      dueDate: '2026-09-22',
    }),
    task('t-due-later', 'b2', {
      scheduledType: 'DATE',
      scheduledDate: '2026-09-30',
      bucket: 'SCHEDULED',
      dueDate: '2026-09-24',
    }),
    task('t-due-tomorrow', 'b3', { bucket: 'ANYTIME', dueDate: '2026-09-25' }),
  ],
  projects: [
    project('p-active', 'a0', { tagIds: ['tag-2'] }),
    project('p-today', 'a1', {
      areaId: 'area-1',
      scheduledType: 'DATE',
      scheduledDate: '2026-09-24',
      bucket: 'SCHEDULED',
    }),
    project('p-trashed', 'a2', { trashedAt: '2026-09-21T00:00:00.000Z' }),
    project('p-done', 'a3', { status: 'COMPLETED', completedAt: '2026-09-23T12:00:00.000Z' }),
    project('p-due', 'a4', { dueDate: '2026-09-23' }),
  ],
  /** feed 视图 → 期望的行（任务与项目混排，带顺序）。 */
  feeds: {
    inbox: ['t-inbox', 't-due-inbox'],
    anytime: ['t-anytime', 't-in-p-today', 't-due-tomorrow'],
    today: [
      'p-today',
      't-today',
      't-overdue',
      'p-due',
      't-due-inbox',
      't-due-someday',
      't-due-later',
    ],
    upcoming: ['t-upcoming', 't-due-later'],
    someday: ['t-someday', 't-due-someday'],
    // 截止日期升序，同一天按位次
    deadlines: ['t-due-someday', 'p-due', 't-due-inbox', 't-due-later', 't-due-tomorrow'],
    logbook: ['p-done', 't-cancelled', 't-done'],
    trash: ['p-trashed', 't-trashed'],
  } satisfies Record<ListView, string[]>,
  /** feed 里项目行的进度（非 Trash 任务总数 / 已了结数）。 */
  projectCounts: {
    'p-today': { total: 1, completed: 0 },
    'p-done': { total: 0, completed: 0 },
    'p-trashed': { total: 0, completed: 0 },
    'p-due': { total: 0, completed: 0 },
  } as Record<string, { total: number; completed: number }>,
  /** 任务列表查询 → 期望的任务（带顺序）。 */
  queries: [
    {
      query: {},
      ids: [
        't-inbox',
        't-anytime',
        't-today',
        't-overdue',
        't-upcoming',
        't-someday',
        't-in-p-today',
        't-due-inbox',
        't-due-someday',
        't-due-later',
        't-due-tomorrow',
      ],
    },
    { query: { projectId: 'p-active' }, ids: ['t-anytime'] },
    { query: { projectId: 'p-active', completed: true }, ids: ['t-anytime', 't-done'] },
    { query: { tagId: 'tag-1' }, ids: ['t-anytime'] },
    // 继承所属 Project 的 Tag
    { query: { tagId: 'tag-2' }, ids: ['t-anytime'] },
    { query: { tagId: 'tag-2', completed: true }, ids: ['t-anytime', 't-done'] },
    // 继承 Area 的 Tag：直接归属，或经所属 Project
    { query: { tagId: 'tag-3' }, ids: ['t-someday', 't-in-p-today'] },
    // 父 Tag 命中整棵子树（自身的 tag-1、经 Project 继承的 tag-2）
    { query: { tagId: 'tag-0' }, ids: ['t-anytime'] },
    { query: { tagId: 'tag-0', completed: true }, ids: ['t-anytime', 't-done'] },
    { query: { q: 'search' }, ids: ['t-someday'] },
    // 搜索 + completed：未了结与已了结都在（ADR 0006）
    { query: { q: 'search', completed: true }, ids: ['t-someday', 't-cancelled'] },
    {
      query: { view: 'today' },
      ids: ['t-today', 't-overdue', 't-due-inbox', 't-due-someday', 't-due-later'],
    },
    { query: { view: 'logbook' }, ids: ['t-cancelled', 't-done'] },
    { query: { view: 'trash' }, ids: ['t-trashed'] },
  ] satisfies Array<{ query: TaskListQuery; ids: string[] }>,
};

export interface ContractSubtask {
  id: string;
  taskId: string;
  title: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  settledAt: string | null;
  position: string;
  createdAt: string;
}

function subtask(
  id: string,
  taskId: string,
  title: string,
  index: number,
  fields: Partial<ContractSubtask> = {},
): ContractSubtask {
  return {
    id,
    taskId,
    title,
    status: 'ACTIVE',
    settledAt: null,
    position: `a${index}`,
    createdAt: CREATED,
    ...fields,
  };
}

/**
 * 任务搜索契约（Quick Find）：同一组数据由 planTaskSearch、设备 Engine
 * 后端的 searchTasks、hub 的 TasksService.search 各跑一遍。期望带顺序；
 * subtasks 为命中的 Subtask id（带顺序）。
 */
export const SEARCH_CONTRACT = {
  /** Tag 条件（Quick Find `#tag`）：st-kitchen 是 st-home 的子 Tag。父 Tag 排在前面。 */
  tags: [
    { id: 'st-home', title: 'Home', parentId: null },
    { id: 'st-kitchen', title: 'Kitchen', parentId: 'st-home' },
    { id: 'st-urgent', title: 'Urgent', parentId: null },
  ],
  /** 归属 sa-house 的任务继承 st-home（有效 Tag，ADR 0015）。 */
  areas: [
    { id: 'sa-house', title: 'House', tagIds: ['st-home'], position: 'a0', createdAt: CREATED },
  ] satisfies ContractArea[],
  tasks: [
    task('s-prefix', 'a5', { title: 'Milk the cow', tagIds: ['st-kitchen'] }),
    task('s-prefix-2', 'a0', { title: 'milkshake' }),
    task('s-title', 'a1', { title: 'Buy milk', areaId: 'sa-house', bucket: 'ANYTIME' }),
    task('s-title-2', 'a3', { title: 'Oat MILK recipe' }),
    task('s-notes', 'a0', {
      title: 'Groceries',
      notes: 'remember milk',
      tagIds: ['st-urgent', 'st-kitchen'],
    }),
    task('s-subtask', 'a2', { title: 'Weekend' }),
    task('s-done', 'a1', {
      title: 'Milk delivery',
      status: 'COMPLETED',
      settledAt: '2026-09-22T10:00:00.000Z',
      tagIds: ['st-kitchen'],
    }),
    task('s-trashed', 'a0', { title: 'Milky way', trashedAt: '2026-09-21T00:00:00.000Z' }),
    task('s-trashed-parent', 'a0', {
      title: 'Chores',
      trashedAt: '2026-09-21T00:00:00.000Z',
    }),
    task('s-miss', 'a0', { title: 'Bread', notes: 'whole wheat' }),
  ],
  subtasks: [
    subtask('sub-bottles', 's-subtask', 'milk bottles', 1, {
      status: 'COMPLETED',
      settledAt: '2026-09-22T10:00:00.000Z',
    }),
    subtask('sub-buy', 's-subtask', 'buy Milk', 0),
    subtask('sub-eggs', 's-subtask', 'eggs', 2),
    subtask('sub-chore', 's-trashed-parent', 'milk run', 0),
    subtask('sub-miss', 's-miss', 'flour', 0),
  ],
  cases: [
    {
      q: ' MiLk ',
      extended: false,
      hits: [
        { id: 's-prefix-2', subtasks: [] },
        { id: 's-prefix', subtasks: [] },
        { id: 's-title', subtasks: [] },
        { id: 's-title-2', subtasks: [] },
        { id: 's-notes', subtasks: [] },
        { id: 's-subtask', subtasks: ['sub-buy', 'sub-bottles'] },
      ],
    },
    {
      q: 'milk',
      extended: true,
      hits: [
        { id: 's-prefix-2', subtasks: [] },
        { id: 's-prefix', subtasks: [] },
        { id: 's-done', subtasks: [] },
        { id: 's-trashed', subtasks: [] },
        { id: 's-title', subtasks: [] },
        { id: 's-title-2', subtasks: [] },
        { id: 's-notes', subtasks: [] },
        { id: 's-subtask', subtasks: ['sub-buy', 'sub-bottles'] },
        { id: 's-trashed-parent', subtasks: ['sub-chore'] },
      ],
    },
    { q: 'eggs', extended: false, hits: [{ id: 's-subtask', subtasks: ['sub-eggs'] }] },
    { q: '   ', extended: true, hits: [] },
    // Tag 条件：子树命中（st-kitchen）与经 Area 继承（s-title）
    {
      q: 'milk',
      extended: false,
      tagIds: ['st-home'],
      hits: [
        { id: 's-prefix', subtasks: [] },
        { id: 's-title', subtasks: [] },
        { id: 's-notes', subtasks: [] },
      ],
    },
    // 多个 Tag 之间是 AND；只有 Tag 条件、没有搜索词也命中
    {
      q: '',
      extended: false,
      tagIds: ['st-home', 'st-urgent'],
      hits: [{ id: 's-notes', subtasks: [] }],
    },
    // 没有搜索词：范围层级 → Position
    {
      q: ' ',
      extended: true,
      tagIds: ['st-kitchen'],
      hits: [
        { id: 's-notes', subtasks: [] },
        { id: 's-prefix', subtasks: [] },
        { id: 's-done', subtasks: [] },
      ],
    },
  ] as Array<{
    q: string;
    extended: boolean;
    tagIds?: string[];
    hits: Array<{ id: string; subtasks: string[] }>;
  }>,
};
