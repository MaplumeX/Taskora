import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateTagDto, TagResponseDto, UpdateTagDto } from '@taskora/shared';

import { createTag, deleteTag, getTags, updateTag } from '@/lib/api/tags.api';

export const tagKeys = {
  all: ['tags'] as const,
  detail: (id: string) => ['tag', id] as const,
};

export function useTagsQuery() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: getTags,
  });
}

// Helper: apply a change to a tag in a list array
function applyToTagInList(
  list: TagResponseDto[] | undefined,
  tagId: string,
  updater: (tag: TagResponseDto) => TagResponseDto,
): TagResponseDto[] | undefined {
  if (!list) return list;
  return list.map((t) => (t.id === tagId ? updater(t) : t));
}

// Helper: remove a tag from a list array
function removeTagFromList(
  list: TagResponseDto[] | undefined,
  tagId: string,
): TagResponseDto[] | undefined {
  if (!list) return list;
  return list.filter((t) => t.id !== tagId);
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

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTagDto) => createTag(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all });
      const snapshot = queryClient.getQueriesData<TagResponseDto[]>({
        queryKey: tagKeys.all,
      });
      const now = new Date().toISOString();
      const tempId = crypto.randomUUID();
      const tempTag: TagResponseDto = {
        id: tempId,
        title: data.title,
        color: data.color ?? '#3B82F6',
        sortOrder: 0,
        tagGroupId: data.tagGroupId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      queryClient.setQueriesData<TagResponseDto[]>(
        { queryKey: tagKeys.all },
        (old) => (old ? [...old, tempTag] : old),
      );
      return { snapshot, tempId };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, tagKeys.all, ctx.snapshot);
      }
    },
    onSuccess: (tag, _data, ctx) => {
      // Replace temp item with server-returned real value
      const tempId = ctx?.tempId;
      queryClient.setQueriesData<TagResponseDto[]>(
        { queryKey: tagKeys.all },
        (old) => {
          if (!old) return old;
          if (tempId) {
            const withoutTemp = old.filter((t) => t.id !== tempId);
            return [...withoutTemp, tag];
          }
          return [...old, tag];
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) => updateTag(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all });
      const snapshot = queryClient.getQueriesData<TagResponseDto[]>({
        queryKey: tagKeys.all,
      });
      const detailSnapshot = queryClient.getQueryData<TagResponseDto>(
        tagKeys.detail(id),
      );
      const now = new Date().toISOString();
      queryClient.setQueriesData<TagResponseDto[]>(
        { queryKey: tagKeys.all },
        (old) =>
          applyToTagInList(old, id, (tag) => ({
            ...tag,
            ...data,
            updatedAt: now,
          })),
      );
      queryClient.setQueryData<TagResponseDto>(tagKeys.detail(id), (old) =>
        old ? { ...old, ...data, updatedAt: now } : old,
      );
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, tagKeys.all, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(tagKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: tagKeys.all });
      const snapshot = queryClient.getQueriesData<TagResponseDto[]>({
        queryKey: tagKeys.all,
      });
      queryClient.setQueriesData<TagResponseDto[]>(
        { queryKey: tagKeys.all },
        (old) => removeTagFromList(old, id),
      );
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreListSnapshot(queryClient, tagKeys.all, ctx.snapshot);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
      // 任务上的标签徽章也需要刷新
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}