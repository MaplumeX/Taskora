import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateTagDto, UpdateTagDto } from '@taskora/shared';

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

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTagDto) => createTag(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) => updateTag(id, data),
    onSuccess: (tag) => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.detail(tag.id) });
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
      // 任务上的标签徽章也需要刷新
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}