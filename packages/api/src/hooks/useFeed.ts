import { useInfiniteQuery, useMutation } from '@tanstack/react-query';

import type { FeedView } from '@taskora/shared';

import { emptyTrash, getFeed, getLogbookArchive } from '@/api/feed.api';
import { refreshAfterWrite, useQueryCache } from './cache-patches';
import { useReplicaQuery } from './useEngineQuery';

export const feedKeys = {
  all: ['feed'] as const,
  list: (view: FeedView) => ['feed', view] as const,
};

/** feed 混排任务与项目行（项目行带任务计数），都嵌入标签芯片。 */
export function useFeedQuery(view: FeedView) {
  return useReplicaQuery({
    queryKey: feedKeys.list(view),
    queryFn: () => getFeed(view),
    dependsOn: ['task', 'project', 'tag'],
  });
}

/**
 * 归档 Logbook（local-first-v3 issue 08）：只在调用 fetchNextPage 时读取
 * （Logbook 滚到底时），第一次调用取第一页。cutoff 为 null（REST 模式，
 * feed 已含全部历史）时不读取。
 */
export function useLogbookArchive(cutoff: string | null) {
  return useInfiniteQuery({
    queryKey: [...feedKeys.list('logbook'), 'archive', cutoff] as const,
    queryFn: ({ pageParam }) => getLogbookArchive(cutoff!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next,
    enabled: false,
    // 归档是只读的历史：不因失焦 / 重连重取
    staleTime: Infinity,
  });
}

export function useEmptyTrash() {
  const queryClient = useQueryCache();
  return useMutation({
    mutationFn: emptyTrash,
    onSuccess: () => {
      refreshAfterWrite(queryClient, { queryKey: feedKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['tasks'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}
