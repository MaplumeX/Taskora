import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus, type TaskResponseDto } from '@taskora/shared';

import { setTaskBackend, type TaskBackend } from '@/api/task-backend';
import { requestTaskReveal, useTaskRevealStore } from '@/stores/taskReveal.store';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { useTaskRevealListener } from './useRevealTask';

function dto(partial: Partial<TaskResponseDto> & { id: string }): TaskResponseDto {
  return {
    title: '任务',
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...partial,
  } as TaskResponseDto;
}

function useFakeTasks(tasks: TaskResponseDto[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  setTaskBackend({
    getTask: async (id: string) => {
      const task = byId.get(id);
      if (!task) throw new Error(`Task not found: ${id}`);
      return task;
    },
  } as unknown as TaskBackend);
}

function Probe() {
  useTaskRevealListener();
  const { pathname } = useLocation();
  return <div data-testid="path">{pathname}</div>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/inbox']}>
      <Probe />
    </MemoryRouter>,
  );
}

describe('useTaskRevealListener — 点通知定位任务', () => {
  beforeEach(() => {
    useUiInteractionStore.setState({
      expandedId: null,
      revealId: null,
      settingsOpen: true,
      searchOpen: true,
    });
    useTaskRevealStore.setState({ pendingTaskId: null });
  });
  afterEach(() => setTaskBackend(undefined));

  it('导航到任务所属视图、展开并请求滚入视野，关闭遮挡的浮层', async () => {
    useFakeTasks([dto({ id: 't1', projectId: 'p1', bucket: TaskBucket.ANYTIME })]);
    renderShell();
    act(() => requestTaskReveal('t1'));

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/projects/p1'));
    expect(useUiInteractionStore.getState()).toMatchObject({
      expandedId: 't1',
      revealId: 't1',
      settingsOpen: false,
      searchOpen: false,
    });
    expect(useTaskRevealStore.getState().pendingTaskId).toBeNull();
  });

  it('请求早于挂载（从通知冷启动）：挂载后仍会执行', async () => {
    useFakeTasks([dto({ id: 't1', bucket: TaskBucket.ANYTIME })]);
    requestTaskReveal('t1');
    renderShell();
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/anytime'));
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
  });

  it('任务不存在：不导航、不展开', async () => {
    useFakeTasks([]);
    renderShell();
    act(() => requestTaskReveal('missing'));
    await waitFor(() => expect(useTaskRevealStore.getState().pendingTaskId).toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('path').textContent).toBe('/inbox');
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
  });

  it('任务已进 Trash：不导航', async () => {
    useFakeTasks([dto({ id: 't1', trashedAt: '2026-02-05T00:00:00.000Z' })]);
    renderShell();
    act(() => requestTaskReveal('t1'));
    await waitFor(() => expect(useTaskRevealStore.getState().pendingTaskId).toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('path').textContent).toBe('/inbox');
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
  });
});
