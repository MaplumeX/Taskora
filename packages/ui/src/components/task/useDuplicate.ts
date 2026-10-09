import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  flattenSelectionRows,
  useDuplicateProject,
  useDuplicateTask,
  useSelectionStore,
  useUiInteractionStore,
} from '@taskora/api';

export interface DuplicateTarget {
  id: string;
  kind: 'task' | 'project';
}

/**
 * 复制（Duplicate，⌘D 与右键菜单共用）：按列表显示顺序逐个复制，每个副本
 * 紧跟各自的来源。selectCopies 时完成后选中副本（对齐 Things 3）。
 */
export function useDuplicate() {
  const { t } = useTranslation('common');
  const { mutateAsync: duplicateTask } = useDuplicateTask();
  const { mutateAsync: duplicateProject } = useDuplicateProject();

  return useCallback(
    async (
      targets: readonly DuplicateTarget[],
      options: { selectCopies?: boolean } = {},
    ): Promise<string[]> => {
      const order = new Map(
        flattenSelectionRows(useSelectionStore.getState()).map((row, index) => [row.id, index]),
      );
      const ordered = [...targets].sort(
        (a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity),
      );
      const copies: string[] = [];
      try {
        for (const target of ordered) {
          const copy =
            target.kind === 'task'
              ? await duplicateTask(target.id)
              : await duplicateProject(target.id);
          copies.push(copy.id);
        }
      } catch {
        toast.error(t('duplicateFailed'));
      }
      if (options.selectCopies && copies.length > 0) {
        useUiInteractionStore.getState().setExpandedId(null);
        useSelectionStore.getState().setSelection(copies);
      }
      return copies;
    },
    [t, duplicateTask, duplicateProject],
  );
}
