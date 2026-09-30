import { useMutation } from '@tanstack/react-query';

import type { CreateTagDto, TagResponseDto, UpdateTagDto } from '@taskora/shared';

import { createTag, deleteTag, getTags, updateTag } from '@/api/tags.api';
import {
  TAG_EMBEDDING_ROOTS,
  cancelRoots,
  patchEmbeddedTag,
  refreshAfterWrite,
  restoreSnapshot,
  snapshotRoots,
  useQueryCache,
} from './cache-patches';
import { useReplicaQuery } from './useEngineQuery';

export const tagKeys = {
  all: ['tags'] as const,
  detail: (id: string) => ['tag', id] as const,
};

export function useTagsQuery() {
  return useReplicaQuery({
    queryKey: tagKeys.all,
    queryFn: getTags,
    dependsOn: ['tag'],
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

// 标签列表之外，任务、项目、区域、feed 行、标签组里都嵌着标签芯片：
// 更新 / 删除时一并修补并快照，失败时整体恢复（local-first-v3 issue 02）。
const TAG_ROOTS = ['tags', ...TAG_EMBEDDING_ROOTS];

// Helper: remove a tag from a list array
function removeTagFromList(
  list: TagResponseDto[] | undefined,
  tagId: string,
): TagResponseDto[] | undefined {
  if (!list) return list;
  return list.filter((t) => t.id !== tagId);
}

export function useCreateTag() {
  const queryClient = useQueryCache();
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
        restoreSnapshot(queryClient, ctx.snapshot);
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
      refreshAfterWrite(queryClient, { queryKey: tagKeys.all });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) => updateTag(id, data),
    onMutate: async ({ id, data }) => {
      await cancelRoots(queryClient, TAG_ROOTS);
      const snapshot = snapshotRoots(queryClient, TAG_ROOTS);
      const detailSnapshot = queryClient.getQueryData<TagResponseDto>(
        tagKeys.detail(id),
      );
      const now = new Date().toISOString();
      const apply = (tag: TagResponseDto) => ({ ...tag, ...data, updatedAt: now });
      queryClient.setQueriesData<TagResponseDto[]>({ queryKey: tagKeys.all }, (old) =>
        applyToTagInList(old, id, apply),
      );
      queryClient.setQueryData<TagResponseDto>(tagKeys.detail(id), (old) =>
        old ? apply(old) : old,
      );
      patchEmbeddedTag(queryClient, id, apply);
      return { snapshot, detailSnapshot, id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
      if (ctx?.detailSnapshot !== undefined) {
        queryClient.setQueryData(tagKeys.detail(ctx.id), ctx.detailSnapshot);
      }
    },
    onSettled: (_data, _error, { id }) => {
      refreshAfterWrite(queryClient, { queryKey: tagKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: tagKeys.all });
      for (const root of TAG_EMBEDDING_ROOTS) {
        refreshAfterWrite(queryClient, { queryKey: [root] });
      }
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onMutate: async (id) => {
      await cancelRoots(queryClient, TAG_ROOTS);
      const snapshot = snapshotRoots(queryClient, TAG_ROOTS);
      queryClient.setQueriesData<TagResponseDto[]>({ queryKey: tagKeys.all }, (old) =>
        removeTagFromList(old, id),
      );
      patchEmbeddedTag(queryClient, id, () => null);
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) {
        restoreSnapshot(queryClient, ctx.snapshot);
      }
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: tagKeys.all });
      // 嵌入的标签芯片也需要刷新
      for (const root of TAG_EMBEDDING_ROOTS) {
        refreshAfterWrite(queryClient, { queryKey: [root] });
      }
    },
  });
}
