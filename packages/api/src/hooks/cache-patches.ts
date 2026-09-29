import type { InvalidateQueryFilters, QueryClient } from '@tanstack/react-query';

import type { TagResponseDto } from '@taskora/shared';

import { isEngineMode } from '@/api/task-backend';

/**
 * 写入成功后的缓存刷新（local-first-v3 issue 02）。
 *
 * REST 模式：mutation 自己让相关查询失效（服务器是数据源）。
 * Engine 模式：空操作——Engine 的变更通知（createEngineInvalidator）是唯一
 * 刷新来源，按涉及的实体合并失效；mutation 再失效一遍只会让每次写入多一轮
 * 整条查询重跑。即时显示仍由各 hook 的乐观补丁负责。
 */
export function refreshAfterWrite(queryClient: QueryClient, filters: InvalidateQueryFilters) {
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
  'tag-groups',
  'tag-group',
];

export type CacheSnapshot = [readonly unknown[], unknown][];

export function snapshotRoots(queryClient: QueryClient, roots: readonly string[]): CacheSnapshot {
  return roots.flatMap((root) => queryClient.getQueriesData({ queryKey: [root] }));
}

export async function cancelRoots(queryClient: QueryClient, roots: readonly string[]) {
  await Promise.all(roots.map((root) => queryClient.cancelQueries({ queryKey: [root] })));
}

export function restoreSnapshot(queryClient: QueryClient, snapshot: CacheSnapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
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
  queryClient: QueryClient,
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
