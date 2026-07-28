import { useQuery } from '@tanstack/react-query';

import type { FeedView } from '@taskora/shared';

import { getFeed } from '@/lib/api/feed.api';

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