/**
 * Engine 的 React 绑定（可选子路径）。
 *
 * useEngineQuery：响应式查询 — selector 结果随本地副本变更自动刷新
 * （本地写零网络往返、pull 应用远端变更后同样触发）。
 */

import { useEffect, useRef, useState } from 'react';

import type { Engine, ReplicaReader } from '../engine';

export function useEngineQuery<T>(engine: Engine, selector: (reader: ReplicaReader) => T): T {
  const [result, setResult] = useState<T>(() => engine.query(selector));
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  useEffect(() => {
    // subscribe 首次回调即回放当前值，保证 engine 换引用时重新同步
    return engine.subscribe((reader) => selectorRef.current(reader), setResult);
  }, [engine]);
  return result;
}
