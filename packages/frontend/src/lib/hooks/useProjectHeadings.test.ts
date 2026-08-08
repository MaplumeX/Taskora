import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectHeadingResponseDto, TaskResponseDto } from '@taskora/shared';
import { HeadingStatus } from '@taskora/shared';

vi.mock('@/lib/api/project-headings.api', () => ({
  getProjectHeadings: vi.fn(),
  createProjectHeading: vi.fn(),
  updateProjectHeading: vi.fn(),
  deleteProjectHeading: vi.fn(),
  reorderProjectHeadingLayout: vi.fn(),
}));

import { getProjectHeadings, reorderProjectHeadingLayout } from '@/lib/api/project-headings.api';
import {
  projectHeadingKeys,
  useProjectHeadingsQuery,
  useReorderProjectHeadingLayout,
} from './useProjectHeadings';
import { taskKeys } from './useTasks';

const headings: ProjectHeadingResponseDto[] = [
  {
    id: 'heading-1',
    projectId: 'project-1',
    title: 'First',
    sortOrder: 0,
    status: HeadingStatus.ACTIVE,
    completedAt: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  },
];

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

describe('project heading hooks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes heading queries by project ID', async () => {
    vi.mocked(getProjectHeadings).mockResolvedValue(headings);
    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useProjectHeadingsQuery('project-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getProjectHeadings).toHaveBeenCalledWith('project-1', { includeArchived: undefined });
    expect(queryClient.getQueryData(projectHeadingKeys.list('project-1'))).toEqual(headings);
    expect(queryClient.getQueryData(projectHeadingKeys.list('project-2'))).toBeUndefined();
  });

  it('invalidates heading and task caches when a layout save fails', async () => {
    vi.mocked(reorderProjectHeadingLayout).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useReorderProjectHeadingLayout(), { wrapper });

    await expect(
      result.current.mutateAsync({
        projectId: 'project-1',
        ungroupedTaskIds: [],
        groups: [],
      }),
    ).rejects.toThrow('network');

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['project-headings', { projectId: 'project-1' }],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks'] });
  });

  it('optimistically updates heading order, task membership, and local order', async () => {
    vi.mocked(reorderProjectHeadingLayout).mockResolvedValue();
    const { wrapper, queryClient } = createWrapper();
    const secondHeading = {
      ...headings[0],
      id: 'heading-2',
      title: 'Second',
      sortOrder: 1,
    };
    queryClient.setQueryData(projectHeadingKeys.list('project-1'), [headings[0], secondHeading]);
    const taskQueryKey = taskKeys.list({ projectId: 'project-1' });
    queryClient.setQueryData<TaskResponseDto[]>(taskQueryKey, [
      {
        id: 'task-1',
        headingId: 'heading-1',
        sortOrder: 0,
      } as TaskResponseDto,
      {
        id: 'task-2',
        headingId: 'heading-2',
        sortOrder: 0,
      } as TaskResponseDto,
    ]);
    const { result } = renderHook(() => useReorderProjectHeadingLayout(), { wrapper });

    await result.current.mutateAsync({
      projectId: 'project-1',
      ungroupedTaskIds: ['task-2'],
      groups: [
        { headingId: 'heading-2', taskIds: ['task-1'] },
        { headingId: 'heading-1', taskIds: [] },
      ],
    });

    expect(
      queryClient
        .getQueryData<ProjectHeadingResponseDto[]>(projectHeadingKeys.list('project-1'))
        ?.map((heading) => [heading.id, heading.sortOrder]),
    ).toEqual([
      ['heading-2', 0],
      ['heading-1', 1],
    ]);
    expect(
      queryClient
        .getQueryData<TaskResponseDto[]>(taskQueryKey)
        ?.map((task) => [task.id, task.headingId, task.sortOrder]),
    ).toEqual([
      ['task-2', null, 0],
      ['task-1', 'heading-2', 0],
    ]);
  });
});
