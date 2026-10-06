import type { QueryClient } from '@tanstack/react-query';

import type { SyncEntity } from '@taskora/engine';

/**
 * 实体 → 需失效的 query root（失效面对齐 event-applier 的口径）：
 * task/project/feed 互相嵌入计数，tag 嵌入一切带标签芯片的缓存。
 * 桌面端与移动端共用这一张表。
 */
export const INVALIDATION_BY_ENTITY: Record<SyncEntity, string[][]> = {
  task: [['tasks'], ['task'], ['feed'], ['projects'], ['project']],
  subtask: [['tasks'], ['task']],
  project: [['projects'], ['project'], ['feed']],
  'project-heading': [['project-headings']],
  area: [['areas'], ['area'], ['feed']],
  tag: [
    ['tags'],
    ['tag'],
    ['tasks'],
    ['task'],
    ['projects'],
    ['project'],
    ['areas'],
    ['area'],
    ['feed'],
  ],
};

const ALL_QUERY_ROOTS = [...new Set(Object.values(INVALIDATION_BY_ENTITY).flat())];

/**
 * Engine 变更 → React Query 缓存失效，按短窗口合并；entities 缺省表示全部。
 *
 * Engine 模式的界面读已改由响应式查询提供（live-queries.ts，local-first-v3
 * issue 06），不再按变更失效 React Query。现在只用于退回 REST 时整体失效：
 * React Query 里留着的是进入 Engine 模式之前的结果。
 */
export function createEngineInvalidator(
  queryClient: QueryClient,
  options: { delayMs?: number } = {},
): (entities?: SyncEntity[]) => void {
  const delayMs = options.delayMs ?? 16;
  let pending: Set<SyncEntity> | 'all' | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const batch = pending;
    pending = null;
    if (batch === null) return;
    const roots =
      batch === 'all'
        ? ALL_QUERY_ROOTS
        : [...new Set([...batch].flatMap((entity) => INVALIDATION_BY_ENTITY[entity] ?? []))];
    for (const root of roots) {
      void queryClient.invalidateQueries({ queryKey: root });
    }
  };

  return (entities) => {
    if (!entities) {
      pending = 'all';
    } else if (pending !== 'all') {
      pending ??= new Set();
      for (const entity of entities) pending.add(entity);
    }
    if (timer === null) timer = setTimeout(flush, delayMs);
  };
}
