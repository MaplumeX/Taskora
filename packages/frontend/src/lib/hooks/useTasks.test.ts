import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

// Mock the tasks API module
vi.mock('@/lib/api/tasks.api', () => ({
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  restoreTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  reorderTasks: vi.fn(),
  convertTaskToProject: vi.fn(),
  createSubtask: vi.fn(),
  updateSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
  completeSubtask: vi.fn(),
  uncompleteSubtask: vi.fn(),
  reorderSubtasks: vi.fn(),
}));

import {
  completeTask,
  createTask,
  deleteTask,
  uncompleteTask,
  updateTask,
} from '@/lib/api/tasks.api';
import { taskKeys, useCompleteTask, useCreateTask, useDeleteTask, useUncompleteTask, useUpdateTask } from './useTasks';

const baseTask: TaskResponseDto = {
  id: 'task-1',
  title: 'My Task',
  notes: null,
  scheduledDate: null,
  scheduledType: ScheduledType.NONE,
  dueDate: null,
  bucket: TaskBucket.INBOX,
  status: TaskStatus.ACTIVE,
  completedAt: null,
  trashedAt: null,
  sortOrder: 0,
  projectId: null,
  headingId: null,
  areaId: null,
  tags: [],
  subtasks: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

describe('useCompleteTask (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically sets status to COMPLETED in list and detail', async () => {
    vi.mocked(completeTask).mockResolvedValue({
      ...baseTask,
      status: TaskStatus.COMPLETED,
      completedAt: '2024-06-01T00:00:00.000Z',
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), baseTask);

    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    result.current.mutate('task-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData?.[0].status).toBe(TaskStatus.COMPLETED);
    });

    const detailData = queryClient.getQueryData<TaskResponseDto>(
      taskKeys.detail('task-1'),
    );
    expect(detailData?.status).toBe(TaskStatus.COMPLETED);
    expect(detailData?.completedAt).not.toBeNull();
  });

  it('rolls back on error', async () => {
    vi.mocked(completeTask).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), baseTask);

    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    await expect(result.current.mutateAsync('task-1')).rejects.toThrow('network');

    const listData = queryClient.getQueryData<TaskResponseDto[]>(
      taskKeys.list({ view: 'today' }),
    );
    expect(listData?.[0].status).toBe(TaskStatus.ACTIVE);
    expect(listData?.[0].completedAt).toBeNull();

    const detailData = queryClient.getQueryData<TaskResponseDto>(
      taskKeys.detail('task-1'),
    );
    expect(detailData?.status).toBe(TaskStatus.ACTIVE);
  });
});

describe('useUncompleteTask (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically sets status to ACTIVE and completedAt=null', async () => {
    const completedTask: TaskResponseDto = {
      ...baseTask,
      status: TaskStatus.COMPLETED,
      completedAt: '2024-06-01T00:00:00.000Z',
    };
    vi.mocked(uncompleteTask).mockResolvedValue({
      ...baseTask,
      status: TaskStatus.ACTIVE,
      completedAt: null,
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [completedTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), completedTask);

    const { result } = renderHook(() => useUncompleteTask(), { wrapper });

    result.current.mutate('task-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData?.[0].status).toBe(TaskStatus.ACTIVE);
    });

    const detailData = queryClient.getQueryData<TaskResponseDto>(
      taskKeys.detail('task-1'),
    );
    expect(detailData?.status).toBe(TaskStatus.ACTIVE);
    expect(detailData?.completedAt).toBeNull();
  });

  it('rolls back on error', async () => {
    const completedTask: TaskResponseDto = {
      ...baseTask,
      status: TaskStatus.COMPLETED,
      completedAt: '2024-06-01T00:00:00.000Z',
    };
    vi.mocked(uncompleteTask).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [completedTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), completedTask);

    const { result } = renderHook(() => useUncompleteTask(), { wrapper });

    await expect(result.current.mutateAsync('task-1')).rejects.toThrow('network');

    const listData = queryClient.getQueryData<TaskResponseDto[]>(
      taskKeys.list({ view: 'today' }),
    );
    expect(listData?.[0].status).toBe(TaskStatus.COMPLETED);
    expect(listData?.[0].completedAt).toBe('2024-06-01T00:00:00.000Z');
  });
});

describe('useUpdateTask (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically merges data into list and detail', async () => {
    vi.mocked(updateTask).mockResolvedValue({
      ...baseTask,
      title: 'Updated Title',
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), baseTask);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    result.current.mutate({ id: 'task-1', data: { title: 'Updated Title' } });

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData?.[0].title).toBe('Updated Title');
    });

    const detailData = queryClient.getQueryData<TaskResponseDto>(
      taskKeys.detail('task-1'),
    );
    expect(detailData?.title).toBe('Updated Title');
  });

  it('rolls back on error', async () => {
    vi.mocked(updateTask).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), baseTask);

    const { result } = renderHook(() => useUpdateTask(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: 'task-1', data: { title: 'Updated Title' } }),
    ).rejects.toThrow('network');

    const listData = queryClient.getQueryData<TaskResponseDto[]>(
      taskKeys.list({ view: 'today' }),
    );
    expect(listData?.[0].title).toBe('My Task');

    const detailData = queryClient.getQueryData<TaskResponseDto>(
      taskKeys.detail('task-1'),
    );
    expect(detailData?.title).toBe('My Task');
  });
});

describe('useCreateTask (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically appends temp item to list, replaces with real on success', async () => {
    const realTask: TaskResponseDto = {
      ...baseTask,
      id: 'task-real',
      title: 'New Task',
    };
    vi.mocked(createTask).mockResolvedValue(realTask);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), []);

    const { result } = renderHook(() => useCreateTask(), { wrapper });

    result.current.mutate({ title: 'New Task' });

    // Immediately has a temp item
    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData).toHaveLength(1);
      expect(listData?.[0].title).toBe('New Task');
    });

    // After success, temp is replaced with real
    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData?.[0].id).toBe('task-real');
    });
  });

  it('rolls back on error', async () => {
    vi.mocked(createTask).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), []);

    const { result } = renderHook(() => useCreateTask(), { wrapper });

    await expect(result.current.mutateAsync({ title: 'New Task' })).rejects.toThrow('network');

    const listData = queryClient.getQueryData<TaskResponseDto[]>(
      taskKeys.list({ view: 'today' }),
    );
    expect(listData).toHaveLength(0);
  });
});

describe('useDeleteTask (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically removes task from list', async () => {
    vi.mocked(deleteTask).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);

    const { result } = renderHook(() => useDeleteTask(), { wrapper });

    result.current.mutate('task-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData).toHaveLength(0);
    });
  });

  it('rolls back on error', async () => {
    vi.mocked(deleteTask).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);

    const { result } = renderHook(() => useDeleteTask(), { wrapper });

    await expect(result.current.mutateAsync('task-1')).rejects.toThrow('network');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData).toHaveLength(1);
      expect(listData?.[0].id).toBe('task-1');
    });
  });
});