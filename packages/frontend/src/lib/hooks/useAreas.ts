import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateAreaDto, UpdateAreaDto } from '@taskora/shared';

import { createArea, deleteArea, getAreas, updateArea } from '@/lib/api/areas.api';

export const areaKeys = {
  all: ['areas'] as const,
  detail: (id: string) => ['area', id] as const,
};

export function useAreasQuery() {
  return useQuery({
    queryKey: areaKeys.all,
    queryFn: getAreas,
  });
}

export function useCreateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAreaDto) => createArea(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.all });
    },
  });
}

export function useUpdateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAreaDto }) => updateArea(id, data),
    onSuccess: (area) => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.detail(area.id) });
      void queryClient.invalidateQueries({ queryKey: areaKeys.all });
    },
  });
}

export function useDeleteArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteArea(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.all });
    },
  });
}