import { describe, expect, it } from 'vitest';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';
import { ProjectBucket, ProjectStatus, ScheduledType, TaskBucket } from '@taskora/shared';

import {
  buildMoveTargets,
  currentMoveTargetId,
  moveTargetDto,
  type MoveTarget,
  type MoveTargetsInput,
} from './moveTargets';

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

const work = area('a-work', '工作');
const life = area('a-life', '生活');

function input(fields: Partial<MoveTargetsInput> = {}): MoveTargetsInput {
  return {
    query: '',
    projects: [
      project('p-loose', '读书计划'),
      project('p-report', '季度报告', { areaId: work.id }),
      project('p-someday', '学吉他', { areaId: life.id, scheduledType: ScheduledType.SOMEDAY }),
      project('p-done', '已完成项目', { status: ProjectStatus.COMPLETED }),
      project('p-trash', '废弃项目', { trashedAt: NOW }),
    ],
    areas: [work, life],
    inboxNames: ['收件箱', 'Inbox'],
    isLater: (p) => p.scheduledType === ScheduledType.SOMEDAY,
    ...fields,
  };
}

const ids = (targets: MoveTarget[]) => targets.map((t) => t.id);

describe('buildMoveTargets', () => {
  it('无搜索词：Inbox 在首位，其后与侧边栏同序；排除已完成与 Trash 中的项目', () => {
    const targets = buildMoveTargets(input());
    expect(ids(targets)).toEqual([
      'inbox',
      'project:p-loose',
      'area:a-work',
      'project:p-report',
      'area:a-life',
      'project:p-someday',
    ]);
  });

  it('区域下的项目缩进；Later Project 弱化', () => {
    const byId = new Map(buildMoveTargets(input()).map((t) => [t.id, t]));
    expect(byId.get('project:p-loose')).toMatchObject({ nested: false, later: false });
    expect(byId.get('project:p-report')).toMatchObject({ nested: true, areaTitle: null });
    expect(byId.get('project:p-someday')).toMatchObject({ nested: true, later: true });
  });

  it('有搜索词：扁平结果，前缀命中先于包含命中，项目行带区域名', () => {
    const projects = [project('p-1', '年度报告', { areaId: work.id }), project('p-2', '报告模板')];
    const targets = buildMoveTargets(input({ query: ' 报告 ', projects }));
    expect(ids(targets)).toEqual(['project:p-2', 'project:p-1']);
    expect(targets[1]).toMatchObject({ nested: false, areaTitle: '工作' });
  });

  it('Inbox 按当前语言名称和英文名匹配；区域可被搜到', () => {
    expect(ids(buildMoveTargets(input({ query: 'inb' })))).toEqual(['inbox']);
    expect(ids(buildMoveTargets(input({ query: '收件' })))).toEqual(['inbox']);
    expect(ids(buildMoveTargets(input({ query: '工作' })))).toEqual(['area:a-work']);
    expect(buildMoveTargets(input({ query: '不存在' }))).toEqual([]);
  });
});

describe('moveTargetDto', () => {
  it('区域与项目互斥写入，bucket 交给数据层推导', () => {
    expect(moveTargetDto({ kind: 'area', id: 'area:a-work', area: work })).toEqual({
      projectId: null,
      areaId: 'a-work',
    });
    const [target] = buildMoveTargets(input({ query: '季度' }));
    expect(moveTargetDto(target)).toEqual({ projectId: 'p-report', areaId: null });
  });

  it('移入 Inbox：清除归属与计划', () => {
    expect(moveTargetDto({ kind: 'inbox', id: 'inbox' })).toEqual({
      projectId: null,
      areaId: null,
      bucket: TaskBucket.INBOX,
      scheduledType: ScheduledType.NONE,
    });
  });
});

describe('currentMoveTargetId', () => {
  it('项目优先，其次区域，未排期的 Inbox 任务在 Inbox', () => {
    expect(currentMoveTargetId({ projectId: 'p1', areaId: 'a1' })).toBe('project:p1');
    expect(currentMoveTargetId({ projectId: null, areaId: 'a1' })).toBe('area:a1');
    expect(
      currentMoveTargetId({ bucket: TaskBucket.INBOX, scheduledType: ScheduledType.NONE }),
    ).toBe('inbox');
  });

  it('已排期 / 无归属的 Anytime / 多选（空对象）不打勾', () => {
    expect(
      currentMoveTargetId({ bucket: TaskBucket.SCHEDULED, scheduledType: ScheduledType.DATE }),
    ).toBeNull();
    expect(
      currentMoveTargetId({ bucket: TaskBucket.ANYTIME, scheduledType: ScheduledType.NONE }),
    ).toBeNull();
    expect(currentMoveTargetId({})).toBeNull();
  });
});
