import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { FeedItem, SubtaskResponseDto, TaskResponseDto } from '@taskora/shared';

// Mock the tasks API module
vi.mock('@/api/tasks.api', () => ({
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  restoreTask: vi.fn(),
  completeTask: vi.fn(),
  uncompleteTask: vi.fn(),
  cancelTask: vi.fn(),
  uncancelTask: vi.fn(),
  reorderTasks: vi.fn(),
  convertTaskToProject: vi.fn(),
  createSubtask: vi.fn(),
  updateSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
  completeSubtask: vi.fn(),
  uncompleteSubtask: vi.fn(),
  cancelSubtask: vi.fn(),
  uncancelSubtask: vi.fn(),
  reorderSubtasks: vi.fn(),
}));

import {
  cancelTask,
  completeTask,
  createSubtask,
  createTask,
  deleteTask,
  reorderSubtasks,
  reorderTasks,
  uncancelTask,
  uncompleteTask,
  updateTask,
} from '@/api/tasks.api';
import {
  taskKeys,
  useCancelTask,
  useCompleteTask,
  useCreateSubtask,
  useCreateTask,
  useDeleteTask,
  useReorderSubtasks,
  useReorderTasks,
  useUncancelTask,
  useUncompleteTask,
  useUpdateTask,
} from './useTasks';

const baseTask: TaskResponseDto = {
  id: 'task-1',
  title: 'My Task',
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

    const detailData = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
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

    const listData = queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' }));
    expect(listData?.[0].status).toBe(TaskStatus.ACTIVE);
    expect(listData?.[0].completedAt).toBeNull();

    const detailData = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
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

    const detailData = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
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

    const listData = queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' }));
    expect(listData?.[0].status).toBe(TaskStatus.COMPLETED);
    expect(listData?.[0].completedAt).toBe('2024-06-01T00:00:00.000Z');
  });
});

describe('useCancelTask (optimistic, spec: task-cancelled)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically sets status to CANCELLED and settled completedAt in list and detail', async () => {
    vi.mocked(cancelTask).mockResolvedValue({
      ...baseTask,
      status: TaskStatus.CANCELLED,
      completedAt: '2026-09-19T00:00:00.000Z',
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), baseTask);

    const { result } = renderHook(() => useCancelTask(), { wrapper });

    result.current.mutate('task-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData?.[0].status).toBe(TaskStatus.CANCELLED);
      expect(listData?.[0].completedAt).not.toBeNull();
    });

    const detailData = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
    expect(detailData?.status).toBe(TaskStatus.CANCELLED);
    expect(detailData?.completedAt).not.toBeNull();
  });

  it('rolls back on error', async () => {
    vi.mocked(cancelTask).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), baseTask);

    const { result } = renderHook(() => useCancelTask(), { wrapper });

    await expect(result.current.mutateAsync('task-1')).rejects.toThrow('network');

    const listData = queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' }));
    expect(listData?.[0].status).toBe(TaskStatus.ACTIVE);
    expect(listData?.[0].completedAt).toBeNull();
  });
});

describe('useUncancelTask (optimistic, spec: task-cancelled)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically sets status to ACTIVE and completedAt=null', async () => {
    const cancelledTask: TaskResponseDto = {
      ...baseTask,
      status: TaskStatus.CANCELLED,
      completedAt: '2026-09-19T00:00:00.000Z',
    };
    vi.mocked(uncancelTask).mockResolvedValue({
      ...baseTask,
      status: TaskStatus.ACTIVE,
      completedAt: null,
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'logbook' }), [cancelledTask]);
    queryClient.setQueryData(taskKeys.detail('task-1'), cancelledTask);

    const { result } = renderHook(() => useUncancelTask(), { wrapper });

    result.current.mutate('task-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'logbook' }),
      );
      expect(listData?.[0].status).toBe(TaskStatus.ACTIVE);
    });

    const detailData = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
    expect(detailData?.status).toBe(TaskStatus.ACTIVE);
    expect(detailData?.completedAt).toBeNull();
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

    const detailData = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
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

    const listData = queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' }));
    expect(listData?.[0].title).toBe('My Task');

    const detailData = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail('task-1'));
    expect(detailData?.title).toBe('My Task');
  });
});

describe('useCreateTask (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically prepends temp item to list, replaces with real on success', async () => {
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

    const listData = queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' }));
    expect(listData).toHaveLength(0);
  });

  it('does not duplicate when a concurrent cache update already flushed the temp row', async () => {
    // 桌面 engine 写后失效 / SSE 缓存手术：mutation 在途时，
    // 并发 refetch 可能已把 temp 行冲成真实行。onSuccess 若仍盲目前插，
    // 会产生同 id 重复条目（React duplicate key → 展开行卸载重建 →
    // 新建任务的标题输入框丢焦）。回归：幂等去重，只保留一行。
    const realTask: TaskResponseDto = {
      ...baseTask,
      id: 'task-real',
      title: 'New Task',
    };
    let resolveCreate: (t: TaskResponseDto) => void = () => {};
    vi.mocked(createTask).mockImplementation(
      () =>
        new Promise<TaskResponseDto>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [baseTask]);

    const { result } = renderHook(() => useCreateTask(), { wrapper });
    result.current.mutate({ title: 'New Task' });

    // onMutate：乐观插入 temp
    await waitFor(() => {
      expect(
        queryClient.getQueryData<TaskResponseDto[]>(taskKeys.list({ view: 'today' })),
      ).toHaveLength(2);
    });

    // 模拟并发缓存更新：temp 被冲掉，列表已含真实行
    queryClient.setQueryData(taskKeys.list({ view: 'today' }), [realTask, baseTask]);

    // mutationFn 返回真实行（onSuccess 接手）
    resolveCreate(realTask);

    await waitFor(() => {
      const listData = queryClient.getQueryData<TaskResponseDto[]>(
        taskKeys.list({ view: 'today' }),
      );
      expect(listData).toHaveLength(2);
      expect(listData?.filter((t) => t.id === 'task-real')).toHaveLength(1);
      expect(listData?.filter((t) => t.id === baseTask.id)).toHaveLength(1);
    });
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

describe('feed 缓存同步乐观更新（Inbox/Today 等视图读 feed）', () => {
  beforeEach(() => vi.clearAllMocks());

  const feedTask = (id: string): FeedItem => ({ ...baseTask, id, type: 'task', tags: [] });
  const feedProject = (id: string): FeedItem =>
    ({ ...feedTask(id), type: 'project', taskTotalCount: 0, taskCompletedCount: 0 }) as FeedItem;

  it('reorder：松手即在 feed 中呈现新顺序，项目行保持原槽位', async () => {
    vi.mocked(reorderTasks).mockReturnValue(new Promise(() => undefined));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(
      ['feed', 'today'],
      [feedTask('a'), feedProject('p'), feedTask('b'), feedTask('c')],
    );
    const { result } = renderHook(() => useReorderTasks(), { wrapper });

    result.current.mutate(['c', 'a', 'b']);

    await waitFor(() => {
      const ids = queryClient.getQueryData<FeedItem[]>(['feed', 'today'])?.map((item) => item.id);
      expect(ids).toEqual(['c', 'p', 'a', 'b']);
    });
  });

  it('reorder 失败回滚 feed', async () => {
    vi.mocked(reorderTasks).mockRejectedValue(new Error('boom'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['feed', 'inbox'], [feedTask('a'), feedTask('b')]);
    const { result } = renderHook(() => useReorderTasks(), { wrapper });

    await expect(result.current.mutateAsync(['b', 'a'])).rejects.toThrow('boom');
    const ids = queryClient.getQueryData<FeedItem[]>(['feed', 'inbox'])?.map((item) => item.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('complete：feed 中的任务行即时变为已完成', async () => {
    vi.mocked(completeTask).mockReturnValue(new Promise(() => undefined));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['feed', 'today'], [feedTask('task-1'), feedProject('task-1-p')]);
    const { result } = renderHook(() => useCompleteTask(), { wrapper });

    result.current.mutate('task-1');

    await waitFor(() => {
      const items = queryClient.getQueryData<FeedItem[]>(['feed', 'today']);
      expect(items?.[0].status).toBe(TaskStatus.COMPLETED);
      expect(items?.[0].type).toBe('task');
      expect(items?.[1].status).toBe(TaskStatus.ACTIVE);
    });
  });

  it('delete：任务行即时从 feed 移除', async () => {
    vi.mocked(deleteTask).mockReturnValue(new Promise(() => undefined));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['feed', 'inbox'], [feedTask('task-1'), feedTask('task-2')]);
    const { result } = renderHook(() => useDeleteTask(), { wrapper });

    result.current.mutate('task-1');

    await waitFor(() => {
      const ids = queryClient.getQueryData<FeedItem[]>(['feed', 'inbox'])?.map((item) => item.id);
      expect(ids).toEqual(['task-2']);
    });
  });
});

describe('Subtask 插入与重排（optimistic）', () => {
  beforeEach(() => vi.clearAllMocks());

  const sub = (id: string, index: number): SubtaskResponseDto => ({
    id,
    title: id,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    position: `a${index}`,
    taskId: 'task-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
  const ids = (queryClient: QueryClient) =>
    queryClient
      .getQueryData<TaskResponseDto>(taskKeys.detail('task-1'))
      ?.subtasks?.map((s) => s.id);

  it('afterId：乐观行即以客户端 id 插到锚点之后，成功后原位保留', async () => {
    vi.mocked(createSubtask).mockResolvedValue({ ...sub('new', 1), title: '新' });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.detail('task-1'), {
      ...baseTask,
      subtasks: [sub('a', 0), sub('b', 1)],
    });

    const { result } = renderHook(() => useCreateSubtask(), { wrapper });
    result.current.mutate({ taskId: 'task-1', data: { id: 'new', title: '新', afterId: 'a' } });

    await waitFor(() => expect(ids(queryClient)).toEqual(['a', 'new', 'b']));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ids(queryClient)).toEqual(['a', 'new', 'b']);
  });

  it('重排乐观生效，失败回滚', async () => {
    let reject!: (err: Error) => void;
    vi.mocked(reorderSubtasks).mockReturnValue(
      new Promise<void>((_, r) => {
        reject = r;
      }),
    );
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(taskKeys.detail('task-1'), {
      ...baseTask,
      subtasks: [sub('a', 0), sub('b', 1)],
    });

    const { result } = renderHook(() => useReorderSubtasks(), { wrapper });
    result.current.mutate({ taskId: 'task-1', orderedIds: ['b', 'a'] });

    await waitFor(() => expect(ids(queryClient)).toEqual(['b', 'a']));
    reject(new Error('boom'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids(queryClient)).toEqual(['a', 'b']);
  });
});
