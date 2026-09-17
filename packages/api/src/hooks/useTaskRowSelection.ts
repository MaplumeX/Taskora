import { useCallback, useEffect } from 'react';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { useSelectionStore } from '@/stores/selection.store';

export type SelectionState = 'idle' | 'selected' | 'expanded';

/** 由 selectedIds/expandedId 推导单行的 Selection 展示态。 */
export function selectionStateOf(
  selectedIds: readonly string[],
  expandedId: string | null,
  id: string,
): SelectionState {
  if (expandedId === id) return 'expanded';
  if (selectedIds.includes(id)) return 'selected';
  return 'idle';
}

/**
 * 行选择/展开语义（Selection ≠ DOM focus，见 CONTEXT.md）。
 *
 * selectedIds 由全局 selection store 承载（ADR-0004，keymap registry
 * 在列表组件之外驱动）；expandedId 沿用 uiInteraction store（与
 * 「新建后自动展开」等鼠标路径共享）。点击循环：idle → selected →
 * expanded → selected（收起）。
 */
export function useTaskRowSelection() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelection = useSelectionStore((s) => s.setSelection);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const expandedId = useUiInteractionStore((s) => s.expandedId);
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;

  // 点击任务行以外区域（含列表外空白、标题区等）关闭展开态。
  // 若当前有 Radix 浮层（Popover/Dialog）打开，则让 Radix 自行处理这次
  // 点击（只关浮层、不关展开态），避免抢行为。
  useEffect(() => {
    if (expandedId === null) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-task-item]')) return;
      const openOverlay = document.querySelector(
        '[data-radix-popper-content-wrapper] [data-state="open"], [role="dialog"][data-state="open"], [data-state="open"][role="listbox"]',
      );
      if (openOverlay) return;
      // 关闭展开态前先让当前聚焦的可编辑元素失焦，触发其 onBlur 提交（标题/备注），
      // 否则组件卸载会令 onBlur 丢失、编辑内容未保存。
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest('[data-task-item]')) {
        active.blur();
      }
      setExpandedId(null);
      clearSelection();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [expandedId, setExpandedId, clearSelection]);

  const handleRowClick = useCallback(
    (id: string) => {
      if (expandedId === id) {
        // expanded → selected（折叠）
        setExpandedId(null);
      } else if (selectedId === id) {
        // selected → expanded
        setExpandedId(id);
      } else {
        // idle / 他行 → 选中他行
        setSelection([id]);
        setExpandedId(null);
      }
    },
    [selectedId, expandedId, setSelection, setExpandedId],
  );

  const handleBlankClick = useCallback(() => {
    clearSelection();
    setExpandedId(null);
  }, [clearSelection, setExpandedId]);

  return {
    selectedId,
    selectedIds,
    expandedId,
    setSelection,
    handleRowClick,
    handleBlankClick,
  };
}
