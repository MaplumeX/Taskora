import { useCallback, useState } from 'react';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';

export type SelectionState = 'idle' | 'selected' | 'expanded';

export function useTaskRowSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const expandedId = useUiInteractionStore((s) => s.expandedId);
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);

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
