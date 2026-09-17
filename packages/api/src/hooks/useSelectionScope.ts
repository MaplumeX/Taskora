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
 */
export function useSelectionScope(rows: SelectionRow[]): void {
  const registerScope = useSelectionStore((s) => s.registerScope);
  const unregisterScope = useSelectionStore((s) => s.unregisterScope);
  const keyRef = useRef<string | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // mount/unmount：一次性注册/注销稳定 key。
  useEffect(() => {
    const key = `scope-${crypto.randomUUID()}`;
    keyRef.current = key;
    registerScope(key, rowsRef.current);
    return () => {
      keyRef.current = null;
      unregisterScope(key);
    };
  }, [registerScope, unregisterScope]);

  // rows 变化：更新该 scope 的行内容（不动 scopeOrder）。
  useEffect(() => {
    const key = keyRef.current;
    if (!key) return;
    registerScope(key, rows);
  }, [rows, registerScope]);
}
