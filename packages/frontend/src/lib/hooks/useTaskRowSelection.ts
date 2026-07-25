import { useCallback, useState } from 'react';

export type SelectionState = 'idle' | 'selected' | 'expanded';

export function useTaskRowSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    [selectedId, expandedId],
  );

  const handleBlankClick = useCallback(() => {
    setSelectedId(null);
    setExpandedId(null);
  }, []);

  return {
    selectedId,
    expandedId,
    handleRowClick,
    handleBlankClick,
  };
}