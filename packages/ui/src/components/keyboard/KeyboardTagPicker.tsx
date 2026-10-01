import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  flattenSelectionRows,
  useSelectionStore,
  useUpdateProject,
  useUpdateTask,
} from '@taskora/api';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { MultiTagsField } from '@/components/task/fields/TagsField';

/** 可经快捷键打标的行：task / project 行，且登记了自身 Tag（组头等行没有）。 */
export function taggableSelection(ids: readonly string[]) {
  const rowById = new Map(
    flattenSelectionRows(useSelectionStore.getState()).map((row) => [row.id, row]),
  );
  return ids.flatMap((id) => {
    const row = rowById.get(id);
    if (!row || (row.kind !== 'task' && row.kind !== 'project') || !row.tagIds) return [];
    return [{ id: row.id, kind: row.kind, tagIds: row.tagIds }];
  });
}

interface Props {
  ids: string[];
  onClose: () => void;
}

/**
 * ⇧⌘T 打开的 Tag Picker（tags-things3 issue 04）：锚定在最后一个选中行，
 * 对 Selection 中的 task / project 行三态打标（单个时即普通勾选）。
 */
export function KeyboardTagPicker({ ids, onClose }: Props) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask();
  const updateProject = useUpdateProject();
  // 写入后行数据变化会重新登记，订阅以刷新三态
  const scopes = useSelectionStore((s) => s.scopes);
  const items = useMemo(() => taggableSelection(ids), [ids, scopes]);
  const kindById = new Map(items.map((item) => [item.id, item.kind]));

  const anchorId = ids.at(-1);
  const anchorRef = useRef({
    getBoundingClientRect: () =>
      document.querySelector(`[data-selection-row="${anchorId}"]`)?.getBoundingClientRect() ??
      new DOMRect(),
  });

  const onError = () => toast.error(t('common:saveFailed'));

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent align="start" className="w-64">
        <MultiTagsField
          items={items}
          onChanges={(changes) => {
            for (const { id, tagIds } of changes) {
              if (kindById.get(id) === 'project') {
                updateProject.mutate({ id, data: { tagIds } }, { onError });
              } else {
                updateTask.mutate({ id, data: { tagIds } }, { onError });
              }
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
