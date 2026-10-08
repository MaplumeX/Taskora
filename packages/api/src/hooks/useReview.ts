import { useMutation } from '@tanstack/react-query';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { markAreaReviewed } from '@/api/areas.api';
import { getReviewQueue, markProjectReviewed } from '@/api/projects.api';
import { refreshAfterWrite, useQueryCache } from './cache-patches';
import { areaKeys } from './useAreas';
import { projectKeys } from './useProjects';
import { useReplicaQuery } from './useEngineQuery';

export const reviewKeys = {
  queue: ['review', 'queue'] as const,
};

/**
 * 回顾队列（Review）：待回顾的 Project 与 Area，附下一次回顾日。只依赖
 * 项目与区域；「今天」变化由跨日刷新重跑（useCalendarQueryRefresh）。
 */
export function useReviewQueueQuery() {
  return useReplicaQuery({
    queryKey: reviewKeys.queue,
    queryFn: getReviewQueue,
    dependsOn: ['project', 'area'],
  });
}

/** 待回顾数（= 回顾队列长度）。 */
export function useReviewCount(): number {
  return useReviewQueueQuery().data?.items.length ?? 0;
}

function patchNextReviewDate<T extends { id: string; nextReviewDate?: string | null }>(
  list: T[] | undefined,
  updated: T,
): T[] | undefined {
  return list?.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
}

/** 标记已回顾（Mark Reviewed）：项目。 */
export function useMarkProjectReviewed() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => markProjectReviewed(id),
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectResponseDto>(projectKeys.detail(project.id), project);
      queryClient.setQueriesData<ProjectResponseDto[]>({ queryKey: projectKeys.all }, (old) =>
        patchNextReviewDate(old, project),
      );
    },
    onSettled: (_data, _error, id) => {
      refreshAfterWrite(queryClient, { queryKey: projectKeys.detail(id) });
      refreshAfterWrite(queryClient, { queryKey: projectKeys.all });
      refreshAfterWrite(queryClient, { queryKey: reviewKeys.queue });
    },
  });
}

/** 标记已回顾（Mark Reviewed）：区域。 */
export function useMarkAreaReviewed() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: (id: string) => markAreaReviewed(id),
    onSuccess: (area) => {
      queryClient.setQueriesData<AreaResponseDto[]>({ queryKey: areaKeys.all }, (old) =>
        patchNextReviewDate(old, area),
      );
    },
    onSettled: () => {
      refreshAfterWrite(queryClient, { queryKey: areaKeys.all });
      refreshAfterWrite(queryClient, { queryKey: reviewKeys.queue });
    },
  });
}
