import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AreaResponseDto } from '@taskora/shared';

// Mock the areas API module
vi.mock('@/lib/api/areas.api', () => ({
  getAreas: vi.fn(),
  getArea: vi.fn(),
  createArea: vi.fn(),
  updateArea: vi.fn(),
  deleteArea: vi.fn(),
}));

import { getAreas, createArea, deleteArea, updateArea } from '@/lib/api/areas.api';
import { areaKeys, useAreasQuery, useCreateArea, useDeleteArea, useUpdateArea } from './useAreas';

const mockAreas: AreaResponseDto[] = [
  {
    id: 'area-1',
    title: 'Work',
    notes: 'Work area',
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'area-2',
    title: 'Personal',
    notes: null,
    sortOrder: 1,
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
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

describe('useAreasQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return areas data', async () => {
    vi.mocked(getAreas).mockResolvedValue(mockAreas);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAreasQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockAreas);
    expect(getAreas).toHaveBeenCalledOnce();
  });

  it('should handle error state', async () => {
    vi.mocked(getAreas).mockRejectedValue(new Error('Network error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAreasQuery(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(Error);
  });
});

describe('useCreateArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call createArea and invalidate queries on success', async () => {
    const newArea: AreaResponseDto = {
      id: 'area-3',
      title: 'Health',
      notes: null,
      sortOrder: 2,
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    };
    vi.mocked(createArea).mockResolvedValue(newArea);
    vi.mocked(getAreas).mockResolvedValue(mockAreas);
    const { wrapper, queryClient } = createWrapper();

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Seed the cache so invalidation has something to invalidate
    const { result: queryResult } = renderHook(() => useAreasQuery(), {
      wrapper,
    });
    await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));

    invalidateSpy.mockClear();

    const { result } = renderHook(() => useCreateArea(), { wrapper });

    await result.current.mutateAsync({ title: 'Health' });

    expect(createArea).toHaveBeenCalledWith({ title: 'Health' });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('optimistically appends temp area, replaces with real on success', async () => {
    const realArea: AreaResponseDto = {
      id: 'area-real',
      title: 'Health',
      notes: null,
      sortOrder: 2,
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
    };
    vi.mocked(createArea).mockResolvedValue(realArea);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(areaKeys.all, [...mockAreas]);

    const { result } = renderHook(() => useCreateArea(), { wrapper });

    result.current.mutate({ title: 'Health' });

    // Immediately has a temp item
    await waitFor(() => {
      const listData = queryClient.getQueryData<AreaResponseDto[]>(areaKeys.all);
      expect(listData).toHaveLength(3);
      expect(listData?.[2].title).toBe('Health');
    });

    // After success, temp is replaced with real
    await waitFor(() => {
      const listData = queryClient.getQueryData<AreaResponseDto[]>(areaKeys.all);
      expect(listData?.[2].id).toBe('area-real');
    });
  });

  it('rolls back on error', async () => {
    vi.mocked(createArea).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(areaKeys.all, [...mockAreas]);

    const { result } = renderHook(() => useCreateArea(), { wrapper });

    await expect(result.current.mutateAsync({ title: 'Health' })).rejects.toThrow('network');

    const listData = queryClient.getQueryData<AreaResponseDto[]>(areaKeys.all);
    expect(listData).toHaveLength(2);
  });
});

describe('useUpdateArea (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically merges data into list and detail', async () => {
    vi.mocked(updateArea).mockResolvedValue({ ...mockAreas[0], title: 'Updated' });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(areaKeys.all, [...mockAreas]);
    queryClient.setQueryData(areaKeys.detail('area-1'), mockAreas[0]);

    const { result } = renderHook(() => useUpdateArea(), { wrapper });

    result.current.mutate({ id: 'area-1', data: { title: 'Updated' } });

    await waitFor(() => {
      const listData = queryClient.getQueryData<AreaResponseDto[]>(areaKeys.all);
      expect(listData?.[0].title).toBe('Updated');
    });

    const detailData = queryClient.getQueryData<AreaResponseDto>(areaKeys.detail('area-1'));
    expect(detailData?.title).toBe('Updated');
  });

  it('rolls back on error', async () => {
    vi.mocked(updateArea).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(areaKeys.all, [...mockAreas]);
    queryClient.setQueryData(areaKeys.detail('area-1'), mockAreas[0]);

    const { result } = renderHook(() => useUpdateArea(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: 'area-1', data: { title: 'Updated' } }),
    ).rejects.toThrow('network');

    const listData = queryClient.getQueryData<AreaResponseDto[]>(areaKeys.all);
    expect(listData?.[0].title).toBe('Work');
  });
});

describe('useDeleteArea (optimistic)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('optimistically removes area from list', async () => {
    vi.mocked(deleteArea).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(areaKeys.all, [...mockAreas]);

    const { result } = renderHook(() => useDeleteArea(), { wrapper });

    result.current.mutate('area-1');

    await waitFor(() => {
      const listData = queryClient.getQueryData<AreaResponseDto[]>(areaKeys.all);
      expect(listData).toHaveLength(1);
    });
  });

  it('rolls back on error', async () => {
    vi.mocked(deleteArea).mockRejectedValue(new Error('network'));
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(areaKeys.all, [...mockAreas]);

    const { result } = renderHook(() => useDeleteArea(), { wrapper });

    await expect(result.current.mutateAsync('area-1')).rejects.toThrow('network');

    await waitFor(() => {
      const listData = queryClient.getQueryData<AreaResponseDto[]>(areaKeys.all);
      expect(listData).toHaveLength(2);
    });
  });
});
