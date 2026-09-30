import { useMutation } from '@tanstack/react-query';

import type { FeedView } from '@taskora/shared';

import { emptyTrash, getFeed } from '@/api/feed.api';
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