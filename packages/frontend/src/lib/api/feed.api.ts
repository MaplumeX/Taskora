import type { FeedItem, FeedView } from '@taskora/shared';

import { apiClient } from './client';

export type { FeedView };

export function getFeed(view: FeedView): Promise<FeedItem[]> {
  return apiClient
    .get<FeedItem[]>('/feed', { params: { view } })
    .then((res) => res.data);
}