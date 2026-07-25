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

import { getAreas, createArea } from '@/lib/api/areas.api';
import { useAreasQuery, useCreateArea } from './useAreas';

const mockAreas: AreaResponseDto[] = [
  {
    id: 'area-1',
    title: 'Work',
    notes: 'Work area',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'area-2',
    title: 'Personal',
    notes: null,
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
});