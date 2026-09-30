import { useCallback, useSyncExternalStore } from 'react';
import { useQuery, type QueryKey } from '@tanstack/react-query';

import type { QueryDependency } from '@taskora/engine';

import {
  liveQueryGeneration,
  liveQueryState,
  subscribeLiveQuery,
  subscribeLiveQueryMode,
  type LiveQueryStatus,
} from '../engine/live-queries';

/** 读查询结果（两种模式共有的字段）。 */
export interface ReplicaQueryResult<T> {
  data: T | undefined;
  error: unknown;
  status: LiveQueryStatus;
  isPending: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

export interface ReplicaQueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  /** Engine 模式下查询依赖的实体（可限定到行 id）。 */
  dependsOn: readonly QueryDependency[];
  enabled?: boolean;
}

const DISABLED: ReplicaQueryResult<never> = Object.freeze({
  data: undefined,
  error: null,
  status: 'pending',
  isPending: true,
  isLoading: false,
  isSuccess: false,
  isError: false,
}) as ReplicaQueryResult<never>;

/** 当前是否为 Engine 模式（响应式：attach / detach 时重渲染）。 */
export function useLiveQueryMode(): boolean {
  return useLiveQueryGeneration() > 0;
}

function useLiveQueryGeneration(): number {
  return useSyncExternalStore(subscribeLiveQueryMode, liveQueryGeneration);
}

/**
 * Engine 模式的读查询（local-first-v3 issue 06）：订阅 Engine 的响应式查询，
 * 依赖的数据变更后只重跑这一条，结果结构没变不触发重渲染。不经 React Query。
 */
export function useEngineQuery<T>(options: ReplicaQueryOptions<T>): ReplicaQueryResult<T> {
  const { queryKey, queryFn, dependsOn } = options;
  const enabled = options.enabled ?? true;
  const generation = useLiveQueryGeneration();
  const active = enabled && generation > 0;
  const hash = JSON.stringify(queryKey);
  const depsHash = JSON.stringify(dependsOn);

  // 同一个键的查询函数语义相同（参数都编码在键里），闭包按键固定即可
  const subscribe = useCallback(
    (listener: () => void) =>
      active ? subscribeLiveQuery({ queryKey, queryFn, dependsOn }, listener) : () => undefined,
    [active, generation, hash, depsHash],
  );
  const state = useSyncExternalStore(subscribe, () => liveQueryState<T>(queryKey));
  if (!active) return DISABLED;
  return {
    data: state.data,
    error: state.error,
    status: state.status,
    isPending: state.status === 'pending',
    isLoading: state.status === 'pending',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
  };
}

/**
 * 副本数据的读查询：Engine 模式走 useEngineQuery，REST 模式（web 回退、
 * 未登录）保留 React Query。两个 hook 都调用、按模式启用其一，模式切换
 * 时不改变 hook 顺序。
 */
export function useReplicaQuery<T>(options: ReplicaQueryOptions<T>): ReplicaQueryResult<T> {
  const live = useLiveQueryMode();
  const enabled = options.enabled ?? true;
  const remote = useQuery({
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    enabled: enabled && !live,
  });
  const engine = useEngineQuery(options);
  return live ? engine : remote;
}
