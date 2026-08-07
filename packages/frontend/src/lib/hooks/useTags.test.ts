import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

// Mock the tags API module
vi.mock('@/lib/api/tags.api', () => ({
  getTags: vi.fn(),
  getTag: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

import { createTag, deleteTag, updateTag } from '@/lib/api/tags.api';
import { tagKeys, useCreateTag, useDeleteTag, useUpdateTag } from './useTags';

const baseTag: TagResponseDto = {
  id: 'tag-1',
  title: 'Important',
  color: '#3B82F6',
  sortOrder: 0,
  tagGroupId: null,
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

describe('useCreateTag (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically appends temp tag, replaces with real on success', async () => {
    const realTag: TagResponseDto = {
      ...baseTag,
      id: 'tag-real',
      title: 'New Tag',
    };
    vi.mocked(createTag).mockResolvedValue(realTag);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(tagKeys.all, []);

    const { result } = renderHook(() => useCreateTag(), { wrapper });

    result.current.mutate({ title: 'New Tag' });

    await waitFor(() => {
      const listData = queryClient.getQueryData<TagResponseDto[]>(tagKeys.all);
      expect(listData).toHaveLength(1);
      expect(listData?.[0].title).toBe('New Tag');
    });

    await waitFor(() => {
      const listData = queryClient.getQueryData<TagResponseDto[]>(tagKeys.all);
      expect(listData?.[0].id).toBe('tag-real');
    });
  });

  it('rolls back on error', async () => {
    vi.mocked(createTag).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(tagKeys.all, []);

    const { result } = renderHook(() => useCreateTag(), { wrapper });

    await expect(result.current.mutateAsync({ title: 'New Tag' })).rejects.toThrow('network');

    const listData = queryClient.getQueryData<TagResponseDto[]>(tagKeys.all);
    expect(listData).toHaveLength(0);
  });
});

describe('useUpdateTag (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically merges data into list and detail', async () => {
    vi.mocked(updateTag).mockResolvedValue({ ...baseTag, title: 'Updated Tag' });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(tagKeys.all, [baseTag]);
    queryClient.setQueryData(tagKeys.detail('tag-1'), baseTag);

    const { result } = renderHook(() => useUpdateTag(), { wrapper });

    result.current.mutate({ id: 'tag-1', data: { title: 'Updated Tag' } });

    await waitFor(() => {
      const listData = queryClient.getQueryData<TagResponseDto[]>(tagKeys.all);
      expect(listData?.[0].title).toBe('Updated Tag');
    });

    const detailData = queryClient.getQueryData<TagResponseDto>(tagKeys.detail('tag-1'));
    expect(detailData?.title).toBe('Updated Tag');
  });

  it('rolls back on error', async () => {
    vi.mocked(updateTag).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(tagKeys.all, [baseTag]);
    queryClient.setQueryData(tagKeys.detail('tag-1'), baseTag);

    const { result } = renderHook(() => useUpdateTag(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: 'tag-1', data: { title: 'Updated Tag' } }),
    ).rejects.toThrow('network');

    const listData = queryClient.getQueryData<TagResponseDto[]>(tagKeys.all);
    expect(listData?.[0].title).toBe('Important');
  });
});

describe('useDeleteTag (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically removes tag from list', async () => {
    vi.mocked(deleteTag).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(tagKeys.all, [baseTag]);

    const { result } = renderHook(() => useDeleteTag(), { wrapper });

    result.current.mutate('tag-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TagResponseDto[]>(tagKeys.all);
      expect(listData).toHaveLength(0);
    });
  });

  it('rolls back on error', async () => {
    vi.mocked(deleteTag).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(tagKeys.all, [baseTag]);

    const { result } = renderHook(() => useDeleteTag(), { wrapper });

    await expect(result.current.mutateAsync('tag-1')).rejects.toThrow('network');

    await waitFor(() => {
      const listData = queryClient.getQueryData<TagResponseDto[]>(tagKeys.all);
      expect(listData).toHaveLength(1);
      expect(listData?.[0].id).toBe('tag-1');
    });
  });
});