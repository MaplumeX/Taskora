import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

// Mock the projects API module
vi.mock('@/api/projects.api', () => ({
  getProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  restoreProject: vi.fn(),
  completeProject: vi.fn(),
  uncompleteProject: vi.fn(),
  reorderProjects: vi.fn(),
}));

import {
  completeProject,
  createProject,
  deleteProject,
  uncompleteProject,
  updateProject,
} from '@/api/projects.api';
import {
  projectKeys,
  useCompleteProject,
  useCreateProject,
  useDeleteProject,
  useUncompleteProject,
  useUpdateProject,
} from './useProjects';

const baseProject: ProjectResponseDto = {
  id: 'project-1',
  title: 'My Project',
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
  tags: [],
  taskTotalCount: 0,
  taskCompletedCount: 0,
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

describe('useCompleteProject (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically sets status to COMPLETED', async () => {
    vi.mocked(completeProject).mockResolvedValue({
      ...baseProject,
      status: ProjectStatus.COMPLETED,
      completedAt: '2024-06-01T00:00:00.000Z',
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [baseProject]);
    queryClient.setQueryData(projectKeys.detail('project-1'), baseProject);

    const { result } = renderHook(() => useCompleteProject(), { wrapper });

    result.current.mutate('project-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
      expect(listData?.[0].status).toBe(ProjectStatus.COMPLETED);
    });

    const detailData = queryClient.getQueryData<ProjectResponseDto>(
      projectKeys.detail('project-1'),
    );
    expect(detailData?.status).toBe(ProjectStatus.COMPLETED);
    expect(detailData?.completedAt).not.toBeNull();
  });

  it('rolls back on error', async () => {
    vi.mocked(completeProject).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [baseProject]);
    queryClient.setQueryData(projectKeys.detail('project-1'), baseProject);

    const { result } = renderHook(() => useCompleteProject(), { wrapper });

    await expect(result.current.mutateAsync('project-1')).rejects.toThrow('network');

    const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
    expect(listData?.[0].status).toBe(ProjectStatus.ACTIVE);
    expect(listData?.[0].completedAt).toBeNull();
  });
});

describe('useUncompleteProject (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically sets status to ACTIVE', async () => {
    const completedProject: ProjectResponseDto = {
      ...baseProject,
      status: ProjectStatus.COMPLETED,
      completedAt: '2024-06-01T00:00:00.000Z',
    };
    vi.mocked(uncompleteProject).mockResolvedValue({
      ...baseProject,
      status: ProjectStatus.ACTIVE,
      completedAt: null,
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [completedProject]);
    queryClient.setQueryData(projectKeys.detail('project-1'), completedProject);

    const { result } = renderHook(() => useUncompleteProject(), { wrapper });

    result.current.mutate('project-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
      expect(listData?.[0].status).toBe(ProjectStatus.ACTIVE);
    });

    const detailData = queryClient.getQueryData<ProjectResponseDto>(
      projectKeys.detail('project-1'),
    );
    expect(detailData?.status).toBe(ProjectStatus.ACTIVE);
    expect(detailData?.completedAt).toBeNull();
  });

  it('rolls back on error', async () => {
    const completedProject: ProjectResponseDto = {
      ...baseProject,
      status: ProjectStatus.COMPLETED,
      completedAt: '2024-06-01T00:00:00.000Z',
    };
    vi.mocked(uncompleteProject).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [completedProject]);
    queryClient.setQueryData(projectKeys.detail('project-1'), completedProject);

    const { result } = renderHook(() => useUncompleteProject(), { wrapper });

    await expect(result.current.mutateAsync('project-1')).rejects.toThrow('network');

    const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
    expect(listData?.[0].status).toBe(ProjectStatus.COMPLETED);
  });
});

describe('useUpdateProject (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically merges data into list and detail', async () => {
    vi.mocked(updateProject).mockResolvedValue({
      ...baseProject,
      title: 'Updated Title',
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [baseProject]);
    queryClient.setQueryData(projectKeys.detail('project-1'), baseProject);

    const { result } = renderHook(() => useUpdateProject(), { wrapper });

    result.current.mutate({ id: 'project-1', data: { title: 'Updated Title' } });

    await waitFor(() => {
      const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
      expect(listData?.[0].title).toBe('Updated Title');
    });

    const detailData = queryClient.getQueryData<ProjectResponseDto>(
      projectKeys.detail('project-1'),
    );
    expect(detailData?.title).toBe('Updated Title');
  });

  it('rolls back on error', async () => {
    vi.mocked(updateProject).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [baseProject]);
    queryClient.setQueryData(projectKeys.detail('project-1'), baseProject);

    const { result } = renderHook(() => useUpdateProject(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: 'project-1', data: { title: 'Updated Title' } }),
    ).rejects.toThrow('network');

    const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
    expect(listData?.[0].title).toBe('My Project');
  });
});

describe('useCreateProject (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not duplicate when a concurrent cache update already flushed the temp row', async () => {
    // 桌面 engine 写后失效 / SSE 缓存手术：mutation 在途时并发 refetch
    // 可能已把 temp 行冲成真实行。onSuccess 若仍盲目追加，会产生同 id
    // 重复条目（React duplicate key）。回归：幂等去重。
    const realProject: ProjectResponseDto = {
      ...baseProject,
      id: 'project-real',
      title: '',
    };
    let resolveCreate: (p: ProjectResponseDto) => void = () => {};
    vi.mocked(createProject).mockImplementation(
      () =>
        new Promise<ProjectResponseDto>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [baseProject]);

    const { result } = renderHook(() => useCreateProject(), { wrapper });
    result.current.mutate({ title: '' });

    // onMutate：乐观追加 temp
    await waitFor(() => {
      expect(queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all)).toHaveLength(2);
    });

    // 模拟并发缓存更新：temp 被冲掉，列表已含真实行
    queryClient.setQueryData(projectKeys.all, [baseProject, realProject]);

    // mutationFn 返回真实行（onSuccess 接手）
    resolveCreate(realProject);

    await waitFor(() => {
      const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
      expect(listData).toHaveLength(2);
      expect(listData?.filter((p) => p.id === 'project-real')).toHaveLength(1);
    });
  });
});

describe('useDeleteProject (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically removes project from list', async () => {
    vi.mocked(deleteProject).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [baseProject]);

    const { result } = renderHook(() => useDeleteProject(), { wrapper });

    result.current.mutate('project-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
      expect(listData).toHaveLength(0);
    });
  });

  it('rolls back on error', async () => {
    vi.mocked(deleteProject).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(projectKeys.all, [baseProject]);

    const { result } = renderHook(() => useDeleteProject(), { wrapper });

    await expect(result.current.mutateAsync('project-1')).rejects.toThrow('network');

    await waitFor(() => {
      const listData = queryClient.getQueryData<ProjectResponseDto[]>(projectKeys.all);
      expect(listData).toHaveLength(1);
      expect(listData?.[0].id).toBe('project-1');
    });
  });
});