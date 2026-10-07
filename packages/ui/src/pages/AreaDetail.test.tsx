import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  projects: [] as ProjectResponseDto[],
  dnd: null as {
    onDragStart: (event: unknown) => void;
    onDragEnd: (event: unknown) => void;
  } | null,
  sidebarDrop: vi.fn(),
  reorderProjectsMutate: vi.fn(),
  taskListViewProps: null as Record<string, unknown> | null,
}));

vi.mock('@dnd-kit/core', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: (props: {
      onDragStart: (event: unknown) => void;
      onDragEnd: (event: unknown) => void;
      children: React.ReactNode;
    }) => {
      // React 生成组件栈（如 act 警告）时会无参调用祖先组件，忽略那次调用。
      if (props) harness.dnd = props;
      return ReactModule.createElement(ReactModule.Fragment, null, props.children);
    },
  };
});

vi.mock('@/components/feed/ProjectFeedRow', async () => {
  const ReactModule = await import('react');
  return {
    ProjectFeedRow: ({ item }: { item: ProjectResponseDto }) =>
      ReactModule.createElement('div', { 'data-project-item': item.id }, item.title),
  };
});
vi.mock('@/components/task/TaskListView', () => ({
  TaskListView: (props: Record<string, unknown>) => {
    harness.taskListViewProps = props;
    return null;
  },
}));
vi.mock('@/components/area/AreaMoreMenu', () => ({ AreaMoreMenu: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useAreasQuery: () => ({ data: [] }),
  useProjectsQuery: () => ({ data: harness.projects }),
  useTasksQuery: () => ({ data: [], isLoading: false, isError: false }),
  useUpdateArea: () => ({ mutate: vi.fn() }),
  useReorderProjects: () => ({ mutate: harness.reorderProjectsMutate }),
  useTagsQuery: () => ({ data: [] }),
  useEffectiveTags: () => effectiveTags,
}));

const effectiveTags = {
  ofTask: () => [],
  ofProject: () => [],
  ofFeedItem: () => [],
};

import AreaDetail from './AreaDetail';
import { AppDndProvider } from '../lib/appDnd';

function project(
  id: string,
  areaId: string | null,
  index: number,
  scheduledType = ScheduledType.NONE,
  scheduledDate: string | null = null,
): ProjectResponseDto {
  return {
    id,
    title: `Project ${id}`,
    notes: null,
    areaId,
    position: `a${index}`,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType,
    scheduledDate,
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

function renderArea() {
  return render(
    <MemoryRouter
      initialEntries={['/areas/a']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/areas/:id" element={<AreaDetail />} />
      </Routes>
    </MemoryRouter>,
    // 列表登记在应用壳的共享拖拽上下文里（ADR 0018）。
    {
      wrapper: ({ children }) => (
        <AppDndProvider onSidebarDrop={harness.sidebarDrop}>{children}</AppDndProvider>
      ),
    },
  );
}

function renderedIds() {
  return Array.from(document.querySelectorAll('[data-project-item]')).map(
    (el) => (el as HTMLElement).dataset.projectItem,
  );
}

beforeEach(() => {
  harness.dnd = null;
  harness.sidebarDrop.mockReset();
  harness.reorderProjectsMutate.mockReset();
  harness.taskListViewProps = null;
  harness.projects = [
    project('x', null, 0),
    project('a1', 'a', 1),
    project('as', 'a', 2, ScheduledType.SOMEDAY),
    project('a2', 'a', 3),
    project('af', 'a', 4, ScheduledType.DATE, '2099-01-01'),
  ];
});

describe('AreaDetail later projects', () => {
  it('活跃项目在上，稍后项目分在「计划」/「Someday」小节', () => {
    renderArea();
    expect(renderedIds()).toEqual(['a1', 'a2', 'af', 'as']);
    expect(screen.getByRole('region', { name: 'nav:upcoming' })).toHaveTextContent('Project af');
    expect(screen.getByRole('region', { name: 'nav:someday' })).toHaveTextContent('Project as');
  });

  it('不显示已完成的项目', () => {
    harness.projects = [
      project('a1', 'a', 1),
      {
        ...project('ad', 'a', 2),
        status: ProjectStatus.COMPLETED,
        completedAt: '2026-08-10T00:00:00.000Z',
      },
    ];
    renderArea();
    expect(renderedIds()).toEqual(['a1']);
  });

  it('活跃项目拖拽排序以全量顺序写回，稍后与其他区域项目原位不动', () => {
    renderArea();
    act(() => harness.dnd?.onDragStart({ active: { id: 'a2' } }));
    act(() => harness.dnd?.onDragEnd({ active: { id: 'a2' }, over: { id: 'a1' } }));
    expect(harness.reorderProjectsMutate).toHaveBeenCalledWith(['x', 'a2', 'as', 'a1', 'af']);
  });

  it('活跃项目行可拖到侧边栏，不改动区域内顺序', () => {
    renderArea();
    act(() => harness.dnd?.onDragStart({ active: { id: 'a2' } }));
    act(() =>
      harness.dnd?.onDragEnd({ active: { id: 'a2' }, over: { id: 'sidebar-drop:someday' } }),
    );
    expect(harness.sidebarDrop).toHaveBeenCalledWith(
      { kind: 'project', project: expect.objectContaining({ id: 'a2' }) },
      { kind: 'someday' },
    );
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
  });
});

describe('AreaDetail 空状态', () => {
  it('区域为空时不显示空提示与占位', () => {
    harness.projects = [];
    renderArea();
    expect(renderedIds()).toEqual([]);
    expect(screen.queryByText('area:noProjects')).toBeNull();
    expect(screen.queryByText('area:noTasks')).toBeNull();
  });

  it('任务区隐藏空状态，不再传入空提示', () => {
    renderArea();
    expect(harness.taskListViewProps).toMatchObject({ hideEmptyState: true, hideOwnership: true });
    expect(harness.taskListViewProps).not.toHaveProperty('emptyHint');
  });
});
