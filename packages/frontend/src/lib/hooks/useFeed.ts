import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FeedView } from '@taskora/shared';

import { emptyTrash, getFeed } from '@/lib/api/feed.api';

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
      void queryClient.invalidateQueries({ queryKey: feedKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}