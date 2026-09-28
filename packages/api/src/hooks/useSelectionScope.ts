import { useEffect, useRef } from 'react';

import {
  useSelectionStore,
  type SelectionRow,
} from '@/stores/selection.store';

/**
 * 列表组件向全局 Selection registry 注册当前可见行（ADR-0004）。
 *
 * key 在组件生命周期内稳定；rows 变化时仅更新行内容（保持注册顺序，
 * 即 DOM 渲染顺序），组件卸载时注销。多个列表（如 Area 详情页的项目
 * 段 + 任务段）各自注册，keymap 按顺序拼接行序列。
 *
 * 调用方应传入 memo 化的 rows 以避免每帧重注册。
 *
 * `rank` 显式指定该 scope 在页面中的先后（默认 0，同号按注册顺序）。子组件的
 * effect 先于父组件执行、异步加载的列表挂载更晚，单靠注册顺序不能保证与 DOM
 * 顺序一致；同页有多个列表时应按从上到下的位置传入递增的 rank。
 */
export function useSelectionScope(rows: SelectionRow[], rank = 0): void {
  const registerScope = useSelectionStore((s) => s.registerScope);
  const unregisterScope = useSelectionStore((s) => s.unregisterScope);
  const keyRef = useRef<string | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const rankRef = useRef(rank);
  rankRef.current = rank;

  // mount/unmount：一次性注册/注销稳定 key。
  useEffect(() => {
    const key = `scope-${crypto.randomUUID()}`;
    keyRef.current = key;
    registerScope(key, rowsRef.current, rankRef.current);
    return () => {
      keyRef.current = null;
      unregisterScope(key);
    };
  }, [registerScope, unregisterScope]);

  // rows 变化：更新该 scope 的行内容（不动 scopeOrder）。
  useEffect(() => {
    const key = keyRef.current;
    if (!key) return;
    registerScope(key, rows, rank);
  }, [rows, rank, registerScope]);
}
