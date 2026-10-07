import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ProjectResponseDto } from '@taskora/shared';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface DndHandlers {
  onDragStart: (event: unknown) => void;
  onDragEnd: (event: unknown) => void;
}

const harness = vi.hoisted(() => ({
  dnd: null as DndHandlers | null,
  projects: [] as ProjectResponseDto[],
  updateTask: vi.fn(),
  completeTask: vi.fn(),
  deleteTask: vi.fn(),
  updateProject: vi.fn(),
  reorderProjects: vi.fn(),
  deleteProject: vi.fn(),
  completeProject: vi.fn(),
  reorderTasks: vi.fn(),
  getTasks: vi.fn(),
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const ReactModule = await import('react');
  return {
    ...(await importOriginal<typeof import('@dnd-kit/core')>()),
    DndContext: (props: DndHandlers & { children: React.ReactNode }) => {
      // React 生成组件栈（如 act 警告）时会无参调用祖先组件，忽略那次调用。
      if (props) harness.dnd = props;
      return ReactModule.createElement(ReactModule.Fragment, null, props?.children);
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/api')>()),
  todayDateKey: () => '2026-10-07',
  useProjectsQuery: () => ({ data: harness.projects }),
  useUpdateTask: () => ({ mutate: harness.updateTask }),
  useCompleteTask: () => ({ mutate: harness.completeTask }),
  useDeleteTask: () => ({ mutate: harness.deleteTask }),
  useUpdateProject: () => ({ mutate: harness.updateProject }),
  useReorderProjects: () => ({ mutate: harness.reorderProjects }),
  useReorderTasks: () => ({ mutate: harness.reorderTasks }),
  getTasks: harness.getTasks,
  useDeleteProject: () => ({ mutate: harness.deleteProject }),
  useCompleteProject: () => ({ mutate: harness.completeProject }),
  useUncompleteProject: () => ({ mutate: vi.fn() }),
}));

import { useSelectionStore } from '@taskora/api';
import { useDndSurface } from '../../lib/appDnd';
import type { DropTask, SidebarDropPayload } from './sidebarDrop';
import { SidebarDropProvider } from './SidebarDropProvider';

function task(id: string, fields: Partial<DropTask> = {}): DropTask {
  return {
    id,
    projectId: null,
    areaId: null,
    bucket: TaskBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    status: TaskStatus.ACTIVE,
    ...fields,
  };
}

function project(id: string, fields: Partial<ProjectResponseDto> = {}): ProjectResponseDto {
  return {
    id,
    title: id,
    notes: null,
    areaId: null,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...fields,
  };
}

/** 一个只提供载荷的列表：拖起 drag:x 即拖着 payload。 */
function ListSurface({ payload }: { payload: SidebarDropPayload }) {
  useDndSurface({ owns: (id) => id === 'drag:x', sidebarPayload: () => payload });
  return null;
}

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function dropOn(payload: SidebarDropPayload, target: string) {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <SidebarDropProvider>
        <ListSurface payload={payload} />
        <Location />
      </SidebarDropProvider>
    </MemoryRouter>,
  );
  act(() => harness.dnd?.onDragStart({ active: { id: 'drag:x' } }));
  act(() => harness.dnd?.onDragEnd({ active: { id: 'drag:x' }, over: { id: target } }));
}

beforeEach(() => {
  harness.dnd = null;
  harness.projects = [];
  for (const mock of [
    harness.updateTask,
    harness.completeTask,
    harness.deleteTask,
    harness.updateProject,
    harness.reorderProjects,
    harness.deleteProject,
    harness.completeProject,
    harness.reorderTasks,
    harness.getTasks,
  ]) {
    mock.mockReset();
  }
  useSelectionStore.getState().setSelection(['t1', 't2']);
});

describe('SidebarDropProvider — tasks', () => {
  it('moves the task into the project, clears the selection and stays on the page', () => {
    dropOn({ kind: 'tasks', tasks: [task('t1')] }, 'sidebar-drop:project:p1');

    expect(harness.updateTask).toHaveBeenCalledWith(
      { id: 't1', data: { projectId: 'p1', areaId: null } },
      expect.anything(),
    );
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(screen.getByTestId('location')).toHaveTextContent('/today');
  });

  it('places the moved group after the project’s tasks without a heading', async () => {
    harness.getTasks.mockResolvedValue([
      { id: 't2', headingId: null, position: 'a' },
      { id: 'u1', headingId: null, position: 'b' },
      { id: 'h1', headingId: 'heading-1', position: 'c' },
    ]);
    dropOn({ kind: 'tasks', tasks: [task('t1'), task('t2')] }, 'sidebar-drop:project:p1');

    expect(harness.updateTask).toHaveBeenCalledTimes(2);
    act(() => harness.updateTask.mock.calls[0][1].onSuccess());
    expect(harness.getTasks).not.toHaveBeenCalled();
    act(() => harness.updateTask.mock.calls[1][1].onSuccess());
    expect(harness.getTasks).toHaveBeenCalledWith({ projectId: 'p1' });
    await vi.waitFor(() =>
      expect(harness.reorderTasks).toHaveBeenCalledWith(['u1', 't1', 't2'], expect.anything()),
    );
  });

  it('completes only the open members of a group on Logbook', () => {
    dropOn(
      { kind: 'tasks', tasks: [task('t1'), task('t2', { status: TaskStatus.COMPLETED })] },
      'sidebar-drop:logbook',
    );

    expect(harness.completeTask).toHaveBeenCalledTimes(1);
    expect(harness.completeTask).toHaveBeenCalledWith('t1', expect.anything());
  });

  it('deletes the whole group on Trash', () => {
    dropOn({ kind: 'tasks', tasks: [task('t1'), task('t2')] }, 'sidebar-drop:trash');

    expect(harness.deleteTask.mock.calls.map(([id]) => id)).toEqual(['t1', 't2']);
  });

  it('schedules for today, skipping tasks already there', () => {
    dropOn(
      {
        kind: 'tasks',
        tasks: [
          task('t1'),
          task('t2', { scheduledType: ScheduledType.DATE, scheduledDate: '2026-10-07' }),
        ],
      },
      'sidebar-drop:today',
    );

    expect(harness.updateTask).toHaveBeenCalledTimes(1);
    expect(harness.updateTask).toHaveBeenCalledWith(
      { id: 't1', data: { scheduledType: ScheduledType.DATE, scheduledDate: '2026-10-07' } },
      expect.anything(),
    );
  });
});

describe('SidebarDropProvider — project', () => {
  it('re-files the project into the area and places it after the area’s projects', () => {
    harness.projects = [
      project('p1', { position: 'a' }),
      project('p2', { areaId: 'a1', position: 'b' }),
      project('p3', { position: 'c' }),
    ];
    dropOn({ kind: 'project', project: harness.projects[0] }, 'sidebar-drop:area:a1');

    expect(harness.updateProject).toHaveBeenCalledWith(
      { id: 'p1', data: { areaId: 'a1' } },
      expect.anything(),
    );
    expect(harness.reorderProjects).not.toHaveBeenCalled();
    act(() => harness.updateProject.mock.calls[0][1].onSuccess());
    expect(harness.reorderProjects).toHaveBeenCalledWith(['p2', 'p1', 'p3'], expect.anything());
  });

  it('completes a project with no open tasks directly', () => {
    harness.projects = [project('p1')];
    dropOn({ kind: 'project', project: harness.projects[0] }, 'sidebar-drop:logbook');

    expect(harness.completeProject).toHaveBeenCalledWith('p1', expect.anything());
  });

  it('asks what to do with the remaining tasks before completing', () => {
    harness.projects = [project('p1', { taskTotalCount: 3, taskCompletedCount: 1 })];
    // 载荷只带列表行的字段；进度计数取自最新的项目数据。
    const { id, areaId, status, scheduledType, scheduledDate } = harness.projects[0];
    dropOn(
      { kind: 'project', project: { id, areaId, status, scheduledType, scheduledDate } },
      'sidebar-drop:logbook',
    );

    expect(harness.completeProject).not.toHaveBeenCalled();
    expect(screen.getByText('completeRemainingTitle')).toBeInTheDocument();
  });

  it('deletes the project on Trash', () => {
    harness.projects = [project('p1')];
    dropOn({ kind: 'project', project: harness.projects[0] }, 'sidebar-drop:trash');

    expect(harness.deleteProject).toHaveBeenCalledWith('p1', expect.anything());
  });

  it('ignores Inbox and project rows and keeps the selection', () => {
    harness.projects = [project('p1')];
    dropOn({ kind: 'project', project: harness.projects[0] }, 'sidebar-drop:inbox');

    expect(harness.updateProject).not.toHaveBeenCalled();
    expect(useSelectionStore.getState().selectedIds).toEqual(['t1', 't2']);
  });
});
