import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectStatus, Start, TaskStatus } from '@taskora/shared';
import type { AreaResponseDto, ProjectResponseDto, TaskResponseDto } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  projects: [] as ProjectResponseDto[],
  tasks: [] as TaskResponseDto[],
  area: null as AreaResponseDto | null,
  reorderFeedMutate: vi.fn(),
  updateAreaMutate: vi.fn(),
  dnd: null as {
    onDragStart: (event: unknown) => void;
    onDragOver?: (event: unknown) => void;
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
  useAreasQuery: () => ({ data: harness.area ? [harness.area] : [] }),
  useProjectsQuery: () => ({ data: harness.projects }),
  useTasksQuery: () => ({ data: harness.tasks, isLoading: false, isError: false }),
  useUpdateArea: () => ({ mutate: harness.updateAreaMutate }),
  useReorderFeed: () => ({ mutate: harness.reorderFeedMutate }),
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
  start = Start.ANYTIME,
  scheduledDate: string | null = null,
): ProjectResponseDto {
  return {
    id,
    title: `Project ${id}`,
    notes: null,
    areaId,
    position: `a${index}`,
    status: ProjectStatus.ACTIVE,
    start,
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
        <QueryClientProvider client={new QueryClient()}>
          <AppDndProvider onSidebarDrop={harness.sidebarDrop}>{children}</AppDndProvider>
        </QueryClientProvider>
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
  harness.reorderFeedMutate.mockReset();
  harness.updateAreaMutate.mockReset();
  harness.tasks = [];
  harness.area = null;
  harness.projects = [
    project('x', null, 0),
    project('a1', 'a', 1),
    project('as', 'a', 2, Start.SOMEDAY),
    project('a2', 'a', 3),
    project('af', 'a', 4, Start.ANYTIME, '2099-01-01'),
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
      null,
    );
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
  });
});

describe('AreaDetail 稍后项目拖拽', () => {
  beforeEach(() => {
    harness.projects.push(project('as2', 'a', 5, Start.SOMEDAY));
  });

  it('某天小节同 Someday 视图：拖拽写回 feed 顺序，不改侧边栏顺序', () => {
    renderArea();
    act(() => harness.dnd?.onDragStart({ active: { id: 'project:as2' } }));
    act(() =>
      harness.dnd?.onDragOver?.({ active: { id: 'project:as2' }, over: { id: 'project:as' } }),
    );
    act(() =>
      harness.dnd?.onDragEnd({ active: { id: 'project:as2' }, over: { id: 'project:as' } }),
    );
    expect(harness.reorderFeedMutate).toHaveBeenCalledWith([
      { type: 'project', id: 'as2' },
      { type: 'project', id: 'as' },
    ]);
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
  });

  it('Someday 项目可拖到侧边栏', () => {
    renderArea();
    act(() => harness.dnd?.onDragStart({ active: { id: 'project:as' } }));
    act(() =>
      harness.dnd?.onDragEnd({ active: { id: 'project:as' }, over: { id: 'sidebar-drop:area:b' } }),
    );
    expect(harness.sidebarDrop).toHaveBeenCalledWith(
      { kind: 'project', project: expect.objectContaining({ id: 'as' }) },
      { kind: 'area', areaId: 'b' },
      null,
    );
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
  });

  it('计划项目可拖到侧边栏，但不在节内排序', () => {
    renderArea();
    act(() => harness.dnd?.onDragStart({ active: { id: 'af' } }));
    act(() => harness.dnd?.onDragEnd({ active: { id: 'af' }, over: { id: 'sidebar-drop:today' } }));
    expect(harness.sidebarDrop).toHaveBeenCalledWith(
      { kind: 'project', project: expect.objectContaining({ id: 'af' }) },
      { kind: 'today' },
      null,
    );
    act(() => harness.dnd?.onDragStart({ active: { id: 'af' } }));
    act(() => harness.dnd?.onDragEnd({ active: { id: 'af' }, over: { id: 'as' } }));
    expect(harness.reorderProjectsMutate).not.toHaveBeenCalled();
  });
});

function task(id: string, start: Start, scheduledDate: string | null = null): TaskResponseDto {
  return {
    id,
    title: `Task ${id}`,
    notes: null,
    scheduledDate,
    start,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    position: `b${id}`,
    projectId: null,
    headingId: null,
    areaId: 'a',
    tags: [],
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}

const area: AreaResponseDto = {
  id: 'a',
  title: 'Area',
  notes: null,
  hideLaterItems: false,
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
};

describe('AreaDetail 稍后项（Hide Later Items）', () => {
  beforeEach(() => {
    harness.tasks = [
      task('t-now', Start.ANYTIME),
      task('t-some', Start.SOMEDAY),
      task('t-early', Start.ANYTIME, '2098-06-01'),
    ];
  });

  it('直属稍后任务不在「任务」段，与稍后项目混排在计划 / 某天小节', () => {
    renderArea();
    expect((harness.taskListViewProps?.tasks as TaskResponseDto[]).map((t) => t.id)).toEqual([
      't-now',
    ]);
    const scheduled = screen.getByRole('region', { name: 'nav:upcoming' });
    // 计划按日期：任务 2098-06-01 在项目 2099-01-01 之前
    expect(scheduled.textContent!.indexOf('Task t-early')).toBeLessThan(
      scheduled.textContent!.indexOf('Project af'),
    );
    const someday = screen.getByRole('region', { name: 'nav:someday' });
    expect(someday).toHaveTextContent('Project as');
    expect(someday).toHaveTextContent('Task t-some');
  });

  it('按钮切换区域的 hideLaterItems；隐藏时两个小节都不渲染', () => {
    harness.area = area;
    const { unmount } = renderArea();
    act(() => screen.getByTestId('later-items-toggle').click());
    expect(harness.updateAreaMutate).toHaveBeenCalledWith(
      { id: 'a', data: { hideLaterItems: true } },
      expect.any(Object),
    );
    unmount();

    harness.area = { ...area, hideLaterItems: true };
    renderArea();
    expect(screen.queryByRole('region', { name: 'nav:upcoming' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'nav:someday' })).toBeNull();
    expect(screen.getByTestId('later-items-toggle')).toHaveTextContent('showLaterItems');
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
