import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedItem, ProjectResponseDto, TagResponseDto, TaskResponseDto } from '@taskora/shared';

vi.mock('@/api/tags.api', () => ({
  getTags: vi.fn(),
  getTag: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));
vi.mock('@/api/projects.api', () => ({
  getProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  restoreProject: vi.fn(),
  completeProject: vi.fn(),
  uncompleteProject: vi.fn(),
  reorderProjects: vi.fn(),
  deleteProject: vi.fn(),
}));

import { type TaskBackend, isEngineMode, setTaskBackend } from '@/api/task-backend';
import { deleteTag, updateTag } from '@/api/tags.api';
import { updateProject } from '@/api/projects.api';
import { refreshAfterWrite } from './cache-patches';
import { useUpdateProject } from './useProjects';
import { useDeleteTag, useUpdateTag } from './useTags';

const tag: TagResponseDto = {
  id: 'tag-1',
  title: 'Work',
  color: '#3B82F6',
  tagGroupId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const otherTag: TagResponseDto = { ...tag, id: 'tag-2', title: 'Home' };

const task = { id: 'task-1', title: 'T', tags: [tag, otherTag] } as unknown as TaskResponseDto;

const feed: FeedItem[] = [
  { id: 'task-1', type: 'task', title: 'T', tags: [tag] } as unknown as FeedItem,
  { id: 'project-1', type: 'project', title: 'Old', tags: [tag] } as unknown as FeedItem,
];

const project = { id: 'project-1', title: 'Old', tags: [tag] } as unknown as ProjectResponseDto;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

function seed(queryClient: QueryClient) {
  queryClient.setQueryData(['tags'], [tag, otherTag]);
  queryClient.setQueryData(['tasks', {}], [task]);
  queryClient.setQueryData(['task', 'task-1'], task);
  queryClient.setQueryData(['feed', 'today'], feed);
  queryClient.setQueryData(['projects'], [project]);
  queryClient.setQueryData(['project', 'project-1'], project);
}

function enterEngineMode() {
  setTaskBackend({} as TaskBackend);
}

describe('refreshAfterWrite', () => {
  afterEach(() => setTaskBackend(undefined));

  it('REST 模式下让查询失效', () => {
    const { queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    expect(isEngineMode()).toBe(false);
    refreshAfterWrite(queryClient, { queryKey: ['tasks'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tasks'] });
  });

  it('Engine 模式下为空操作（由 Engine 变更通知负责）', () => {
    enterEngineMode();
    const { queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    expect(isEngineMode()).toBe(true);
    refreshAfterWrite(queryClient, { queryKey: ['tasks'] });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('标签 mutation 修补嵌入的标签芯片', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setTaskBackend(undefined));

  it('改颜色：任务、任务详情、feed 行、项目里的芯片即时更新', async () => {
    let resolve!: (value: TagResponseDto) => void;
    vi.mocked(updateTag).mockReturnValue(new Promise((r) => (resolve = r)));
    const { wrapper, queryClient } = createWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useUpdateTag(), { wrapper });
    result.current.mutate({ id: 'tag-1', data: { color: '#FF0000' } });

    await waitFor(() => {
      const feedData = queryClient.getQueryData<FeedItem[]>(['feed', 'today']);
      expect(feedData?.every((item) => item.tags[0].color === '#FF0000')).toBe(true);
    });
    const taskList = queryClient.getQueryData<TaskResponseDto[]>(['tasks', {}]);
    expect(taskList?.[0].tags?.map((t) => t.color)).toEqual(['#FF0000', '#3B82F6']);
    expect(
      queryClient.getQueryData<TaskResponseDto>(['task', 'task-1'])?.tags?.[0].color,
    ).toBe('#FF0000');
    expect(
      queryClient.getQueryData<ProjectResponseDto[]>(['projects'])?.[0].tags?.[0].color,
    ).toBe('#FF0000');

    resolve({ ...tag, color: '#FF0000' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('失败时恢复所有嵌入缓存的快照', async () => {
    vi.mocked(updateTag).mockRejectedValue(new Error('boom'));
    const { wrapper, queryClient } = createWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useUpdateTag(), { wrapper });
    await expect(
      result.current.mutateAsync({ id: 'tag-1', data: { color: '#FF0000' } }),
    ).rejects.toThrow('boom');

    expect(queryClient.getQueryData(['feed', 'today'])).toEqual(feed);
    expect(queryClient.getQueryData(['tasks', {}])).toEqual([task]);
    expect(queryClient.getQueryData(['project', 'project-1'])).toEqual(project);
  });

  it('删除：从 feed 行与任务上移除芯片', async () => {
    vi.mocked(deleteTag).mockResolvedValue(undefined as never);
    const { wrapper, queryClient } = createWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useDeleteTag(), { wrapper });
    await result.current.mutateAsync('tag-1');

    const feedData = queryClient.getQueryData<FeedItem[]>(['feed', 'today']);
    expect(feedData?.every((item) => item.tags.length === 0)).toBe(true);
    const taskList = queryClient.getQueryData<TaskResponseDto[]>(['tasks', {}]);
    expect(taskList?.[0].tags?.map((t) => t.id)).toEqual(['tag-2']);
  });

  it('Engine 模式下写入成功后不自行失效', async () => {
    enterEngineMode();
    vi.mocked(updateTag).mockResolvedValue({ ...tag, color: '#FF0000' });
    const { wrapper, queryClient } = createWrapper();
    seed(queryClient);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTag(), { wrapper });
    await result.current.mutateAsync({ id: 'tag-1', data: { color: '#FF0000' } });

    expect(spy).not.toHaveBeenCalled();
  });

  it('REST 模式下写入后让嵌入缓存失效', async () => {
    vi.mocked(updateTag).mockResolvedValue({ ...tag, color: '#FF0000' });
    const { wrapper, queryClient } = createWrapper();
    seed(queryClient);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTag(), { wrapper });
    await result.current.mutateAsync({ id: 'tag-1', data: { color: '#FF0000' } });

    const roots = spy.mock.calls.map(([filters]) => filters?.queryKey?.[0]);
    expect(roots).toEqual(expect.arrayContaining(['tags', 'tasks', 'feed', 'projects']));
  });
});

describe('项目 mutation 修补 feed 里的项目行', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setTaskBackend(undefined));

  it('改名：feed 项目行即时更新，失败时恢复', async () => {
    let settle!: () => void;
    const pending = new Promise<void>((r) => (settle = r));
    vi.mocked(updateProject).mockImplementation(async () => {
      await pending;
      throw new Error('boom');
    });
    const { wrapper, queryClient } = createWrapper();
    seed(queryClient);

    const { result } = renderHook(() => useUpdateProject(), { wrapper });
    result.current.mutate({ id: 'project-1', data: { title: 'New' } });

    await waitFor(() => {
      const row = queryClient
        .getQueryData<FeedItem[]>(['feed', 'today'])
        ?.find((item) => item.type === 'project');
      expect(row?.title).toBe('New');
      expect(row?.type).toBe('project');
    });
    // 任务行不受影响
    expect(
      queryClient.getQueryData<FeedItem[]>(['feed', 'today'])?.find((i) => i.type === 'task')
        ?.title,
    ).toBe('T');

    settle();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(['feed', 'today'])).toEqual(feed);
  });

  it('Engine 模式下写入成功后不自行失效', async () => {
    enterEngineMode();
    vi.mocked(updateProject).mockResolvedValue({ ...project, title: 'New' });
    const { wrapper, queryClient } = createWrapper();
    seed(queryClient);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateProject(), { wrapper });
    await result.current.mutateAsync({ id: 'project-1', data: { title: 'New' } });

    expect(spy).not.toHaveBeenCalled();
  });
});
