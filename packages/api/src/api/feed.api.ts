import { archiveCutoff, DEFAULT_ARCHIVE_AFTER_DAYS } from '@taskora/engine';
import type { FeedItem, FeedView, LogbookArchivePage } from '@taskora/shared';

import { apiClient } from './client';
import { currentTaskBackend, isEngineMode } from './task-backend';

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

/**
 * Logbook 归档截止（local-first-v3 issue 08）：Engine 模式下副本不保留
 * 在此之前了结的归档任务，Logbook 滚到底时从 hub 按页读取。REST 模式的
 * feed 本就来自 hub、包含全部历史，返回 null。
 */
export function logbookArchiveCutoff(nowMs = Date.now()): string | null {
  return isEngineMode() ? archiveCutoff(nowMs, DEFAULT_ARCHIVE_AFTER_DAYS) : null;
}

/** 归档 Logbook 的一页（在线读取 hub，只读、不进副本）。 */
export async function getLogbookArchive(
  settledBefore: string,
  page?: string,
): Promise<LogbookArchivePage> {
  const response = await apiClient.get<LogbookArchivePage>('/feed/logbook/archive', {
    params: { settledBefore, ...(page ? { page } : {}) },
  });
  return response.data;
}
