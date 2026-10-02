import { describe, expect, it, vi } from 'vitest';

import type {
  AreaResponseDto,
  ProjectResponseDto,
  TagGroupResponseDto,
  TagResponseDto,
} from '@taskora/shared';
import { ProjectStatus } from '@taskora/shared';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { buildQuickAddSnapshot, quickAddTexts } from './quick-add-snapshot';

const NOW = '2026-09-01T00:00:00.000Z';
const t = (key: string) => `<${key}>`;

function project(
  id: string,
  title: string,
  areaId: string | null,
  position: string,
  extra: Partial<ProjectResponseDto> = {},
): ProjectResponseDto {
  return {
    id,
    title,
    areaId,
    position,
    status: ProjectStatus.ACTIVE,
    trashedAt: null,
    taskTotalCount: 0,
    taskCompletedCount: 0,
    ...extra,
  } as unknown as ProjectResponseDto;
}

const area = (id: string, title: string, position: string) =>
  ({ id, title, position }) as unknown as AreaResponseDto;

function tag(id: string, title: string, tagGroupId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', tagGroupId, createdAt: NOW, updatedAt: NOW };
}

const group = (id: string, title: string) =>
  ({ id, title, tags: [], createdAt: NOW, updatedAt: NOW }) as unknown as TagGroupResponseDto;

describe('buildQuickAddSnapshot', () => {
  const base = {
    projects: [] as ProjectResponseDto[],
    areas: [] as AreaResponseDto[],
    tags: [] as TagResponseDto[],
    tagGroups: [] as TagGroupResponseDto[],
    timeZone: 'Asia/Shanghai',
    weekStartsOn: 1 as const,
    t,
    isLater: () => false,
  };

  it('归属：Inbox 在首位，其后与侧边栏同序（项目缩进在所属区域下）；稍后与已完成项目不列出', () => {
    const snapshot = buildQuickAddSnapshot({
      ...base,
      areas: [area('a1', 'Work', 'a0')],
      projects: [
        project('p1', 'Launch', 'a1', 'a0'),
        project('p2', 'Someday trip', null, 'a1'),
        project('p3', 'Groceries', null, 'a2'),
        project('p4', 'Done', null, 'a3', { status: ProjectStatus.COMPLETED }),
      ],
      isLater: (p) => p.id === 'p2',
    });
    expect(snapshot.placements).toEqual([
      { kind: 'inbox', title: '<nav:inbox>', depth: 0 },
      { kind: 'area', id: 'a1', title: 'Work', depth: 0 },
      { kind: 'project', id: 'p1', title: 'Launch', depth: 1 },
      { kind: 'project', id: 'p3', title: 'Groceries', depth: 0 },
    ]);
  });

  it('Tag 按 Group 分组，未分组的放最后', () => {
    const snapshot = buildQuickAddSnapshot({
      ...base,
      tags: [tag('t1', 'Urgent'), tag('t2', 'Office', 'g1')],
      tagGroups: [group('g1', 'Place')],
    });
    expect(snapshot.tags).toEqual([
      { kind: 'header', title: 'Place' },
      { kind: 'tag', id: 't2', title: 'Office', color: '#3B82F6' },
      { kind: 'tag', id: 't1', title: 'Urgent', color: '#3B82F6' },
    ]);
  });

  it('带版本、账号时区、周起始与全部文案', () => {
    const snapshot = buildQuickAddSnapshot(base);
    expect(snapshot).toMatchObject({ v: 1, timeZone: 'Asia/Shanghai', weekStartsOn: 1 });
    expect(snapshot.texts).toEqual(quickAddTexts(t));
    expect(Object.values(snapshot.texts).every((text) => text.startsWith('<'))).toBe(true);
  });
});
