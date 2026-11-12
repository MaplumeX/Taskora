import { useCallback, useEffect } from 'react';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { useSelectionStore } from '@/stores/selection.store';

export type SelectionState = 'idle' | 'selected' | 'expanded';

/** 触控按下到抬起的位移不超过此值才算点击（超过视为滑动）。 */
const TAP_SLOP_PX = 10;

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

  // 点击任务行以外区域（含列表外空白、标题区等）关闭展开态；展开任务的
  // 底栏（移动 / 删除 / 更多）作用于该任务，不算行外。
  // 若当前有 Radix 浮层（Popover/Dialog）打开，则让 Radix 自行处理这次
  // 点击（只关浮层、不关展开态），避免抢行为。
  // 触控按下可能是滑动滚动的开始：要等抬起且没有明显位移（浏览器接管滚动时会
  // 发 pointercancel）才算点击行外，否则手指往上拉列表就会把任务收起。
  useEffect(() => {
    if (expandedId === null) return;
    const isOutside = (target: HTMLElement | null) => {
      if (!target) return false;
      if (target.closest('[data-task-item], [data-expanded-task-toolbar]')) return false;
      const openOverlay = document.querySelector(
        '[data-radix-popper-content-wrapper] [data-state="open"], [role="dialog"][data-state="open"], [data-state="open"][role="listbox"]',
      );
      return !openOverlay;
    };
    const collapse = () => {
      // 关闭展开态前先让当前聚焦的可编辑元素失焦，触发其 onBlur 提交（标题/备注），
      // 否则组件卸载会令 onBlur 丢失、编辑内容未保存。
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest('[data-task-item]')) {
        active.blur();
      }
      setExpandedId(null);
      clearSelection();
    };
    let pendingTouch: { id: number; x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (!isOutside(e.target as HTMLElement | null)) {
        pendingTouch = null;
        return;
      }
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
        pendingTouch = null;
        collapse();
        return;
      }
      pendingTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      const pending = pendingTouch;
      if (!pending || pending.id !== e.pointerId) return;
      pendingTouch = null;
      const moved = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (moved > TAP_SLOP_PX) return;
      collapse();
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (pendingTouch?.id === e.pointerId) pendingTouch = null;
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
    };
  }, [expandedId, setExpandedId, clearSelection]);

  const handleRowClick = useCallback(
    (id: string) => {
      if (expandedId === id) {
        // expanded → selected（折叠）
        setExpandedId(null);
      } else if (selectedId === id && selectedIds.length === 1) {
        // selected → expanded
        setExpandedId(id);
      } else {
        // idle / 他行 / 多选中的一行 → 只选中该行
        setSelection([id]);
        setExpandedId(null);
      }
    },
    [selectedId, selectedIds.length, expandedId, setSelection, setExpandedId],
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
