import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import { reloadOnceForNewBuild } from './chunkRecovery';

/**
 * 给动态 import 包一层自愈：失败时若能刷新（不在冷却期内）就刷新并从新入口
 * 重来，否则把错误原样抛给上层。
 *
 * 刷新发生时会返回一个永不 settle 的 Promise，让 Suspense fallback 一直挂到
 * 页面重载，而不是先闪一下错误界面。
 */
export function loadWithRecovery<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch((error: unknown) => {
    if (reloadOnceForNewBuild()) {
      return new Promise<never>(() => {});
    }
    throw error;
  });
}

/**
 * `React.lazy` 的替代，用于路由级代码分割：部署后旧 chunk 被删除导致的
 * `Failed to fetch dynamically imported module` 会自动刷新自愈，而不是冒泡
 * 成应用级错误。
 */
export function lazyWithRetry(
  factory: () => Promise<{ default: ComponentType }>,
): LazyExoticComponent<ComponentType> {
  return lazy(() => loadWithRecovery(factory));
}
