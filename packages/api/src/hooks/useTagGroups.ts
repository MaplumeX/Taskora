import { useMutation } from '@tanstack/react-query';

import type { CreateTagGroupDto, TagGroupResponseDto, UpdateTagGroupDto } from '@taskora/shared';

import {
  createTagGroup,
  deleteTagGroup,
  getTagGroups,
  reorderTagGroups,
  updateTagGroup,
} from '@/api/tag-groups.api';
import { sortByOrderedIds, tagKeys } from './useTags';
import { refreshAfterWrite, restoreSnapshot, useQueryCache } from './cache-patches';
import { useReplicaQuery } from './useEngineQuery';

export const tagGroupKeys = {
  all: ['tag-groups'] as const,
  detail: (id: string) => ['tag-group', id] as const,
};

export function useTagGroupsQuery() {
  return useReplicaQuery({
    queryKey: tagGroupKeys.all,
    queryFn: getTagGroups,
    dependsOn: ['tag-group', 'tag'],
  });
}

export function useCreateTagGroup() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (data: CreateTagGroupDto) => createTagGroup(data),
    onSuccess: () => {
      refreshAfterWrite(queryClient, { queryKey: tagGroupKeys.all });
    },
  });
}

export function useUpdateTagGroup() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagGroupDto }) =>
      updateTagGroup(id, data),
    onSuccess: (group) => {
      refreshAfterWrite(queryClient, { queryKey: tagGroupKeys.detail(group.id) });
      refreshAfterWrite(queryClient, { queryKey: tagGroupKeys.all });
    },
  });
}

export function useDeleteTagGroup() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => deleteTagGroup(id),
    onSuccess: () => {
      refreshAfterWrite(queryClient, { queryKey: tagGroupKeys.all });
      // 组删除后标签的 tagGroupId 变 null，需刷新标签列表
      refreshAfterWrite(queryClient, { queryKey: tagKeys.all });
    },
  });
}
export function useReorderTagGroups() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderTagGroups(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: tagGroupKeys.all });
      const snapshot = queryClient.getQueriesData<TagGroupResponseDto[]>({
        queryKey: tagGroupKeys.all,
      });
      queryClient.setQueriesData<TagGroupResponseDto[]>({ queryKey: tagGroupKeys.all }, (old) =>
        old ? sortByOrderedIds(old, orderedIds) : old,
      );
      return { snapshot };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.snapshot) restoreSnapshot(queryClient, ctx.snapshot);
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: tagGroupKeys.all });
    },
  });
}
