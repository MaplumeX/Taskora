import type { FeedItem, FeedView } from '@taskora/shared';

import { currentTaskBackend } from './task-backend';

export type { FeedView };

export function getFeed(view: FeedView): Promise<FeedItem[]> {
  // Feed 与 Task 同源：注入 Engine 后也走本地副本（Inbox/Today 等
  // 切片的 Task CRUD 全部本地化，ADR-0007 切片一）。
  return currentTaskBackend().getFeed(view);
}

export function emptyTrash(): Promise<{ deletedTasks: number; deletedProjects: number }> {
  // 与 Task/Feed 同源（TaskBackend）：Engine 实现下断网可用（Delete
  // Request，ADR-0008）。
  return currentTaskBackend().emptyTrash();
}
