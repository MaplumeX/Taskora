import type { FeedItem, FeedView } from '@taskora/shared';

import { apiClient } from './client';

export type { FeedView };

export function getFeed(view: FeedView): Promise<FeedItem[]> {
  return apiClient
    .get<FeedItem[]>('/feed', { params: { view } })
    .then((res) => res.data);
}

export function emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }> {
  return apiClient
    .post<{ deletedTasks: number; deletedProjects: number }>('/feed/trash/empty')
    .then((res) => res.data);
}