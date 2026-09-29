import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FeedView } from '@taskora/shared';

import { emptyTrash, getFeed } from '@/api/feed.api';
import { refreshAfterWrite } from './cache-patches';

export const feedKeys = {
  all: ['feed'] as const,
  list: (view: FeedView) => ['feed', view] as const,
};

export function useFeedQuery(view: FeedView) {
  return useQuery({
    queryKey: feedKeys.list(view),
    queryFn: () => getFeed(view),
  });
}

export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: emptyTrash,
    onSuccess: () => {
      refreshAfterWrite(queryClient, { queryKey: feedKeys.all });
      refreshAfterWrite(queryClient, { queryKey: ['tasks'] });
      refreshAfterWrite(queryClient, { queryKey: ['projects'] });
    },
  });
}