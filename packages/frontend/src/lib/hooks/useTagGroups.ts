import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateTagGroupDto, UpdateTagGroupDto } from '@taskora/shared';

import {
  createTagGroup,
  deleteTagGroup,
  getTagGroups,
  updateTagGroup,
} from '@/lib/api/tag-groups.api';
import { tagKeys } from './useTags';

export const tagGroupKeys = {
  all: ['tag-groups'] as const,
  detail: (id: string) => ['tag-group', id] as const,
};

export function useTagGroupsQuery() {
  return useQuery({
    queryKey: tagGroupKeys.all,
    queryFn: getTagGroups,
  });
}

export function useCreateTagGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTagGroupDto) => createTagGroup(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tagGroupKeys.all });
    },
  });
}

export function useUpdateTagGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagGroupDto }) =>
      updateTagGroup(id, data),
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: tagGroupKeys.detail(group.id) });
      void queryClient.invalidateQueries({ queryKey: tagGroupKeys.all });
    },
  });
}

export function useDeleteTagGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTagGroup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tagGroupKeys.all });
      // 组删除后标签的 tagGroupId 变 null，需刷新标签列表
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}