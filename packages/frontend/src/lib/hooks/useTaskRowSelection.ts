import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SelectionState = 'idle' | 'selected' | 'expanded';

export function useTaskRowSelection() {
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const expandedId = params.get('expand');

  const setExpandedId = useCallback(
    (id: string | null) => {
      setParams(id ? { expand: id } : {}, { replace: true });
    },
    [setParams],
  );

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