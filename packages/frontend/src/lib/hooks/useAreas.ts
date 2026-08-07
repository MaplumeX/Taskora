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

// Helper: apply a change to an area in a list array
function applyToAreaInList(
  list: AreaResponseDto[] | undefined,
  areaId: string,
  updater: (area: AreaResponseDto) => AreaResponseDto,
): AreaResponseDto[] | undefined {
  if (!list) return list;
  return list.map((a) => (a.id === areaId ? updater(a) : a));
}

// Helper: remove an area from a list array
function removeAreaFromList(
  list: AreaResponseDto[] | undefined,
  areaId: string,
): AreaResponseDto[] | undefined {
  if (!list) return list;
  return list.filter((a) => a.id !== areaId);
}

// Restore snapshot to queries data (list caches)
function restoreListSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly string[],
  snapshot: [readonly unknown[], unknown][],
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key as readonly string[], data);
  }
}

export function useCreateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAreaDto) => createArea(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: areaKeys.all });
      const snapshot = queryClient.getQueriesData<AreaResponseDto[]>({
        queryKey: areaKeys.all,
      });
      const now = new Date().toISOString();
      const tempId = crypto.randomUUID();
      const tempArea: AreaResponseDto = {
        id: tempId,
        title: data.title,
        notes: data.notes ?? null,
        sortOrder: 0,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueriesData<AreaResponseDto[]>(
        { queryKey: areaKeys.all },
        (old) => (old ? [...old, tempArea] : old),
      );
      return { snapshot, tempId };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, areaKeys.all, ctx.snapshot);
      }
    },
    onSuccess: (area, _data, ctx) => {
      // Replace temp item with server-returned real value
      const tempId = ctx?.tempId;
      queryClient.setQueriesData<AreaResponseDto[]>(
        { queryKey: areaKeys.all },
        (old) => {
          if (!old) return old;
          if (tempId) {
            const withoutTemp = old.filter((a) => a.id !== tempId);
            return [...withoutTemp, area];
          }
          return [...old, area];
        },
      );
      // Set detail cache so detail page can read immediately
      queryClient.setQueryData(areaKeys.detail(area.id), area);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.all });
    },
  });
}

export function useUpdateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAreaDto }) => updateArea(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: areaKeys.all });
      const snapshot = queryClient.getQueriesData<AreaResponseDto[]>({
        queryKey: areaKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<AreaResponseDto>(
        areaKeys.detail(id),
      );
      const now = new Date().toISOString();
      queryClient.setQueriesData<AreaResponseDto[]>(
        { queryKey: areaKeys.all },
        (old) =>
          applyToAreaInList(old, id, (area) => ({
            ...area,
            ...data,
            updatedAt: now,
          })),
      );
      queryClient.setQueryData<AreaResponseDto>(areaKeys.detail(id), (old) =>
        old ? { ...old, ...data, updatedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, areaKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(areaKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.detail(id) });
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: areaKeys.all });
      const snapshot = queryClient.getQueriesData<AreaResponseDto[]>({
        queryKey: areaKeys.all,
      });
      queryClient.setQueriesData<AreaResponseDto[]>(
        { queryKey: areaKeys.all },
        (old) => removeAreaFromList(old, id),
      );
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, areaKeys.all, ctx.snapshot);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: areaKeys.all });
    },
  });
}