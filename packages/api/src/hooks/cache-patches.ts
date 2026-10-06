import { useMemo } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

import type { TagResponseDto } from '@taskora/shared';

import { isEngineMode } from '@/api/task-backend';
import { isLiveQueryMode, queryCache, type QueryCacheFacade } from '../engine/live-queries';

/**
 * mutation 操作的缓存：Engine 模式为响应式查询存储，REST 模式为 React
 * Query（local-first-v3 issue 06）。乐观补丁代码两种模式共用。
 */
export function useQueryCache(): QueryCacheFacade {
  const queryClient = useQueryClient();
  return useMemo(() => queryCache(queryClient), [queryClient]);
}

/**
 * 写入成功后的缓存刷新（local-first-v3 issue 02）。
 *
 * REST 模式：mutation 自己让相关查询失效（服务器是数据源）。
 * Engine 模式：空操作——写入提交后 Engine 只重跑依赖受影响的响应式查询
 * （issue 06），mutation 再刷新一遍只会多一轮查询。即时显示仍由各 hook 的
 * 乐观补丁负责。
 */
export function refreshAfterWrite(
  queryClient: QueryCacheFacade,
  filters: { queryKey?: QueryKey; exact?: boolean },
) {
  if (isEngineMode()) return;
  void queryClient.invalidateQueries(filters);
}

/** 嵌入了 TagResponseDto（`tags` 数组）的查询根：列表与详情。 */
const TAG_EMBEDDING_ROOTS = [
  'tasks',
  'task',
  'feed',
  'projects',
  'project',
  'areas',
  'area',
];

export type CacheSnapshot = [QueryKey, unknown][];

export function snapshotRoots(queryClient: QueryCacheFacade, roots: readonly string[]): CacheSnapshot {
  return roots.flatMap((root) => queryClient.getQueriesData({ queryKey: [root] }));
}

export async function cancelRoots(queryClient: QueryCacheFacade, roots: readonly string[]) {
  await Promise.all(roots.map((root) => queryClient.cancelQueries({ queryKey: [root] })));
}

/**
 * 写入失败后恢复补丁前的快照。Engine 模式下再按副本重跑这些查询：补丁
 * 作废过它们在飞的结果，其间若有别的变更（如远端同步）会就此丢失。
 */
export function restoreSnapshot(queryClient: QueryCacheFacade, snapshot: CacheSnapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
  if (!isLiveQueryMode()) return;
  for (const [key] of snapshot) void queryClient.invalidateQueries({ queryKey: key, exact: true });
}

type WithTags = { tags?: TagResponseDto[] };

function patchTagsOf<T>(value: T, update: (tags: TagResponseDto[]) => TagResponseDto[]): T {
  if (!value || typeof value !== 'object') return value;
  const tags = (value as WithTags).tags;
  if (!Array.isArray(tags)) return value;
  const next = update(tags);
  return next === tags ? value : ({ ...value, tags: next } as T);
}

/**
 * 修补各缓存里嵌入的标签芯片（任务、项目、区域、feed 行、标签组）：
 * update 返回 null 表示移除该标签。标签列表本身由调用方另行修补。
 */
export function patchEmbeddedTag(
  queryClient: QueryCacheFacade,
  tagId: string,
  update: (tag: TagResponseDto) => TagResponseDto | null,
) {
  const mapTags = (tags: TagResponseDto[]) => {
    if (!tags.some((tag) => tag.id === tagId)) return tags;
    return tags.flatMap((tag) => {
      if (tag.id !== tagId) return [tag];
      const next = update(tag);
      return next ? [next] : [];
    });
  };
  for (const root of TAG_EMBEDDING_ROOTS) {
    queryClient.setQueriesData<unknown>({ queryKey: [root] }, (old: unknown) =>
      Array.isArray(old)
        ? old.map((item) => patchTagsOf(item, mapTags))
        : patchTagsOf(old, mapTags),
    );
  }
}

export { TAG_EMBEDDING_ROOTS };
