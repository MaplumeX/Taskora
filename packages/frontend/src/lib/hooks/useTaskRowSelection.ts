import { useCallback, useEffect, useState } from 'react';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';

export type SelectionState = 'idle' | 'selected' | 'expanded';

export function useTaskRowSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const expandedId = useUiInteractionStore((s) => s.expandedId);
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);

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
      setSelectedId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [expandedId, setExpandedId]);

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
        setSelectedId(id);
        setExpandedId(null);
      }
    },
    [selectedId, expandedId, setExpandedId],
  );

  const handleBlankClick = useCallback(() => {
    setSelectedId(null);
    setExpandedId(null);
  }, [setExpandedId]);

  return {
    selectedId,
    expandedId,
    handleRowClick,
    handleBlankClick,
  };
}
