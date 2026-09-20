import type { FeedItem, FeedView } from '@taskora/shared';

import { apiClient } from './client';
import { currentTaskBackend } from './task-backend';

export type { FeedView };

export function getFeed(view: FeedView): Promise<FeedItem[]> {
  // Feed 与 Task 同源：注入 Engine 后也走本地副本（Inbox/Today 等
  // 切片的 Task CRUD 全部本地化，ADR-0007 切片一）。
  return currentTaskBackend().getFeed(view);
}

export function emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }> {
  return apiClient
    .post<{ deletedTasks: number; deletedProjects: number }>('/feed/trash/empty')
    .then((res) => res.data);
}