import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';
import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';
import { describe, expect, it } from 'vitest';

import {
  STANDALONE_PROJECT_CONTAINER,
  findProjectContainer,
  moveProjectToPlacement,
  normalizeSidebarProjectLayout,
  resolveProjectPlacement,
  serializeProjectOrder,
  sidebarProjectLayoutsEqual,
  type SidebarProjectLayout,
} from './sidebarProjectLayout';

function area(id: string): AreaResponseDto {
  return {
    id,
    title: id,
    notes: null,
    sortOrder: 0,
    tags: [],
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}

function project(id: string, areaId: string | null): ProjectResponseDto {
  return {
    id,
    title: id,
    notes: null,
    areaId,
    sortOrder: 0,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    tags: [],
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}

const layout: SidebarProjectLayout = {
  containers: {
    standalone: ['standalone-a', 'standalone-b'],
    'area-a': ['area-a-1', 'area-a-2'],
    'area-b': [],
  },
};

const areas = [area('area-a'), area('area-b')];

describe('sidebar project layout normalization', () => {
  it('preserves project order and empty area containers', () => {
    expect(
      normalizeSidebarProjectLayout(
        [
          project('standalone-a', null),
          project('area-a-1', 'area-a'),
          project('standalone-b', null),
        ],
        areas,
      ),
    ).toEqual({
      containers: {
        standalone: ['standalone-a', 'standalone-b'],
        'area-a': ['area-a-1'],
        'area-b': [],
      },
    });
  });

  it('keeps a project with an unknown area visible as standalone', () => {
    const normalized = normalizeSidebarProjectLayout(
      [project('legacy', 'missing')],
      areas,
    );

    expect(normalized.containers[STANDALONE_PROJECT_CONTAINER]).toEqual(['legacy']);
  });
});

describe('sidebar project placement helpers', () => {
  it('resolves project before/after, area heading first, and empty container end', () => {
    expect(resolveProjectPlacement(layout, 'proj:area-a-2', 'before')).toEqual({
      containerId: 'area-a',
      index: 1,
    });
    expect(resolveProjectPlacement(layout, 'proj:area-a-2', 'after')).toEqual({
      containerId: 'area-a',
      index: 2,
    });
    expect(resolveProjectPlacement(layout, 'area:area-a', 'after')).toEqual({
      containerId: 'area-a',
      index: 0,
    });
    expect(resolveProjectPlacement(layout, 'project-container:area-b', 'before')).toEqual({
      containerId: 'area-b',
      index: 0,
    });
    expect(resolveProjectPlacement(layout, 'project-container:standalone', 'before')).toEqual({
      containerId: 'standalone',
      index: 2,
    });
  });

  it('moves projects between standalone, area, and empty area containers', () => {
    const intoArea = moveProjectToPlacement(layout, 'standalone-a', {
      containerId: 'area-a',
      index: 1,
    });
    const intoEmptyArea = moveProjectToPlacement(intoArea!, 'area-a-2', {
      containerId: 'area-b',
      index: 0,
    });
    const backToStandalone = moveProjectToPlacement(intoEmptyArea!, 'area-a-2', {
      containerId: 'standalone',
      index: 2,
    });

    expect(intoArea?.containers.standalone).toEqual(['standalone-b']);
    expect(intoArea?.containers['area-a']).toEqual([
      'area-a-1',
      'standalone-a',
      'area-a-2',
    ]);
    expect(intoEmptyArea?.containers['area-b']).toEqual(['area-a-2']);
    expect(backToStandalone?.containers.standalone).toEqual([
      'standalone-b',
      'area-a-2',
    ]);
  });

  it('corrects insertion indexes for upward and downward movement', () => {
    const sameContainer: SidebarProjectLayout = {
      containers: { standalone: ['a', 'b', 'c', 'd'] },
    };

    expect(
      moveProjectToPlacement(sameContainer, 'd', {
        containerId: 'standalone',
        index: 1,
      })?.containers.standalone,
    ).toEqual(['a', 'd', 'b', 'c']);
    expect(
      moveProjectToPlacement(sameContainer, 'b', {
        containerId: 'standalone',
        index: 4,
      })?.containers.standalone,
    ).toEqual(['a', 'c', 'd', 'b']);
  });

  it('returns null for no-op and invalid moves without mutating the input', () => {
    const snapshot = structuredClone(layout);

    expect(
      moveProjectToPlacement(layout, 'area-a-1', {
        containerId: 'area-a',
        index: 0,
      }),
    ).toBeNull();
    expect(
      moveProjectToPlacement(layout, 'missing', {
        containerId: 'area-a',
        index: 0,
      }),
    ).toBeNull();
    expect(resolveProjectPlacement(layout, 'project-container:missing', 'before')).toBeNull();
    expect(layout).toEqual(snapshot);
  });
});

describe('sidebar project layout serialization', () => {
  it('serializes standalone then area containers in visual area order', () => {
    expect(serializeProjectOrder(layout, [areas[1], areas[0]])).toEqual([
      'standalone-a',
      'standalone-b',
      'area-a-1',
      'area-a-2',
    ]);
    expect(findProjectContainer(layout, 'area-a-2')).toBe('area-a');
  });

  it('compares every container and ordered project id', () => {
    expect(sidebarProjectLayoutsEqual(layout, structuredClone(layout))).toBe(true);
    expect(
      sidebarProjectLayoutsEqual(layout, {
        containers: { ...layout.containers, 'area-b': ['standalone-a'] },
      }),
    ).toBe(false);
  });
});
