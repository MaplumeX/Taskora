import { describe, expect, it } from 'vitest';

import type {
  AreaResponseDto,
  ProjectResponseDto,
  TagResponseDto,
  TaskResponseDto,
  TaskSearchHit,
} from '@taskora/shared';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';

import {
  buildQuickFindGroups,
  highlightParts,
  quickFindRoute,
  type QuickFindGroup,
  type QuickFindInput,
} from './quickFindResults';

const NOW = '2026-09-01T00:00:00.000Z';

function project(
  id: string,
  title: string,
  fields: Partial<ProjectResponseDto> = {},
): ProjectResponseDto {
  return {
    id,
    title,
    notes: null,
    areaId: null,
    sortOrder: 0,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...fields,
  };
}

function area(id: string, title: string): AreaResponseDto {
  return { id, title, notes: null, sortOrder: 0, createdAt: NOW, updatedAt: NOW };
}

function tag(id: string, title: string): TagResponseDto {
  return {
    id,
    title,
    color: '#3B82F6',
    sortOrder: 0,
    tagGroupId: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function hit(id: string): TaskSearchHit {
  return {
    task: { id, title: id } as TaskResponseDto,
    matchedSubtasks: [],
    rank: 'title',
  };
}

const LISTS = [
  { to: '/inbox', names: ['收件箱', 'Inbox'] },
  { to: '/today', names: ['今天', 'Today'] },
  { to: '/upcoming', names: ['计划', 'Upcoming'] },
  { to: '/tags', names: ['标签', 'Tags'] },
];

function input(fields: Partial<QuickFindInput>): QuickFindInput {
  return { query: '', lists: LISTS, projects: [], areas: [], tags: [], hits: [], ...fields };
}

function summary(groups: QuickFindGroup[]): Record<string, string[]> {
  return Object.fromEntries(groups.map((group) => [group.id, group.items.map((i) => i.id)]));
}

describe('buildQuickFindGroups', () => {
  it('空白搜索词不出结果', () => {
    expect(buildQuickFindGroups(input({ query: '   ', hits: [hit('t1')] }))).toEqual([]);
  });

  it('内置列表按当前语言名与英文别名命中', () => {
    expect(summary(buildQuickFindGroups(input({ query: '今天' })))).toEqual({
      lists: ['list:/today'],
    });
    expect(summary(buildQuickFindGroups(input({ query: 'TODAY' })))).toEqual({
      lists: ['list:/today'],
    });
  });

  it('组顺序固定为列表 → 区域与项目 → 标签 → 任务，空组不出现', () => {
    const groups = buildQuickFindGroups(
      input({
        query: 'in',
        projects: [project('p1', 'Main work')],
        tags: [tag('g1', 'Inspire')],
        hits: [hit('t1')],
      }),
    );
    expect(summary(groups)).toEqual({
      // Inbox 前缀命中，Upcoming 包含命中
      lists: ['list:/inbox', 'list:/upcoming'],
      places: ['project:p1'],
      tags: ['tag:g1'],
      tasks: ['task:t1'],
    });
    expect(
      buildQuickFindGroups(input({ query: 'zzz', hits: [hit('t1')] })).map((g) => g.id),
    ).toEqual(['tasks']);
  });

  it('区域与项目按侧边栏全局视觉顺序，前缀命中先于包含命中', () => {
    const groups = buildQuickFindGroups(
      input({
        query: 'work',
        areas: [area('a1', 'Home work'), area('a2', 'Work')],
        projects: [
          project('p1', 'Side work', { areaId: 'a2' }),
          project('p2', 'Workshop'),
          project('p3', 'Homework', { areaId: 'a1' }),
        ],
      }),
    );
    // 视觉顺序：a2, p1, p2, a1, p3；前缀档：a2, p2；包含档：p1, a1, p3
    expect(summary(groups).places).toEqual([
      'area:a2',
      'project:p2',
      'project:p1',
      'area:a1',
      'project:p3',
    ]);
  });

  it('已了结或在 Trash 的项目不作为导航目标，Later Project 保留', () => {
    const groups = buildQuickFindGroups(
      input({
        query: 'plan',
        projects: [
          project('p-done', 'Plan A', { status: ProjectStatus.COMPLETED }),
          project('p-trash', 'Plan B', { trashedAt: NOW }),
          project('p-later', 'Plan C', {
            scheduledType: ScheduledType.SOMEDAY,
          }),
        ],
      }),
    );
    expect(summary(groups).places).toEqual(['project:p-later']);
  });

  it('继续搜索：已了结项目排在未了结之后，Trash 中的项目再其后', () => {
    const projects = [
      project('p-done', 'Plan done', { status: ProjectStatus.COMPLETED }),
      project('p-open', 'Plan open'),
    ];
    const trashedProjects = [project('p-trash', 'Plan trash', { trashedAt: NOW })];
    expect(
      summary(buildQuickFindGroups(input({ query: 'plan', projects, trashedProjects }))).places,
    ).toEqual(['project:p-open']);
    expect(
      summary(
        buildQuickFindGroups(input({ query: 'plan', projects, trashedProjects, extended: true })),
      ).places,
    ).toEqual(['project:p-open', 'project:p-done', 'project:p-trash']);
    // 档位仍优先：包含命中的未了结项目排在前缀命中的 Trash 项目之后
    expect(
      summary(
        buildQuickFindGroups(
          input({
            query: 'plan',
            projects: [project('p-open', 'My plan')],
            trashedProjects,
            extended: true,
          }),
        ),
      ).places,
    ).toEqual(['project:p-trash', 'project:p-open']);
  });

  it('任务组保持 searchTasks 的顺序', () => {
    const groups = buildQuickFindGroups(input({ query: 'x', hits: [hit('b'), hit('a')] }));
    expect(summary(groups).tasks).toEqual(['task:b', 'task:a']);
  });
});

describe('quickFindRoute', () => {
  it('导航目标给出路由，任务为 null', () => {
    const [lists, places, tags, tasks] = buildQuickFindGroups(
      input({
        query: 'to',
        areas: [area('a1', 'Tokyo')],
        tags: [tag('g1', 'Todo')],
        hits: [hit('t1')],
      }),
    );
    expect(quickFindRoute(lists.items[0])).toBe('/today');
    expect(quickFindRoute(places.items[0])).toBe('/areas/a1');
    expect(quickFindRoute(tags.items[0])).toBe('/tags/g1');
    expect(quickFindRoute(tasks.items[0])).toBeNull();
  });
});

describe('highlightParts', () => {
  it('不区分大小写地切出全部命中片段，保留原文大小写', () => {
    expect(highlightParts('Milk and MILK', ' milk ')).toEqual([
      { text: 'Milk', match: true },
      { text: ' and ', match: false },
      { text: 'MILK', match: true },
    ]);
  });

  it('无搜索词或不命中时整段不高亮', () => {
    expect(highlightParts('abc', '')).toEqual([{ text: 'abc', match: false }]);
    expect(highlightParts('abc', 'x')).toEqual([{ text: 'abc', match: false }]);
  });
});
