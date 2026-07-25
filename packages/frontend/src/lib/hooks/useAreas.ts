import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from '@taskora/shared';

import {
  createArea,
  deleteArea,
  getAreas,
  reorderAreas,
  updateArea,
} from '@/lib/api/areas.api';

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

export function useReorderAreas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderAreas(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: areaKeys.all });
      queryClient.setQueriesData<AreaResponseDto[]>(
        { queryKey: areaKeys.all },
        (old) => {
          if (!old) return old;
          const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
          return [...old].sort((a, b) => {
            const ai = orderMap.get(a.id);
            const bi = orderMap.get(b.id);
            if (ai !== undefined && bi !== undefined) return ai - bi;
            return 0;
          });
        },
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.all });
    },
    onSettled: () => {
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