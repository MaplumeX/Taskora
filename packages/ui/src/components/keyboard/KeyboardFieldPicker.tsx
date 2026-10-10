import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  flattenSelectionRows,
  getClientKind,
  useSelectionStore,
  useUpdateProject,
  useUpdateTask,
  type SelectionRowItem,
} from '@taskora/api';
import type { UpdateProjectDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { MultiTagsField } from '@/components/task/fields/TagsField';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { DueDateField } from '@/components/task/fields/DueDateField';
import { RepeatRuleField } from '@/components/task/fields/RepeatRuleField';
import { MovePicker } from '@/components/task/fields/MovePicker';
import type { MoveCurrent } from '@/components/task/fields/moveTargets';
import { ProjectMovePicker } from '@/components/project/ProjectMovePicker';

/** 键盘打开的字段卡片：⇧⌘T 标签、⌘S 计划、⇧⌘D 截止、⇧⌘R 重复、⇧⌘M 移动。 */
export type KeyboardFieldKind = 'tags' | 'when' | 'deadline' | 'repeat' | 'move';

/** 键盘字段动作的作用对象：选中的 task / project 行（组头、Heading 不算）。 */
export interface FieldTarget {
  id: string;
  kind: 'task' | 'project';
  tagIds?: string[];
  item?: SelectionRowItem;
}

export function fieldSelection(ids: readonly string[]): FieldTarget[] {
  const rowById = new Map(
    flattenSelectionRows(useSelectionStore.getState()).map((row) => [row.id, row]),
  );
  return ids.flatMap((id) => {
    const row = rowById.get(id);
    if (!row || row.groupHeader || (row.kind !== 'task' && row.kind !== 'project')) return [];
    return [{ id: row.id, kind: row.kind, tagIds: row.tagIds, item: row.item }];
  });
}

/** 可经快捷键打标的行：task / project 行，且登记了自身 Tag（组头等行没有）。 */
export function taggableSelection(ids: readonly string[]) {
  return fieldSelection(ids).flatMap(({ id, kind, tagIds }) =>
    tagIds ? [{ id, kind, tagIds }] : [],
  );
}

/** 该卡片能否作用于这组行（重复规则只对单个 DATE 型条目）。 */
export function fieldPickerApplies(kind: KeyboardFieldKind, targets: FieldTarget[]): boolean {
  if (targets.length === 0) return false;
  if (kind === 'tags') return targets.some((target) => target.tagIds);
  if (targets.some((target) => !target.item)) return false;
  if (kind === 'repeat') {
    return targets.length === 1 && targets[0].item!.scheduledType === ScheduledType.DATE;
  }
  // 多选只含任务行；项目行只会单个出现
  return true;
}

interface Props {
  kind: KeyboardFieldKind;
  ids: string[];
  onClose: () => void;
}

/**
 * 键盘打开的字段卡片（tags-things3 issue 04 起的 Tag Picker 推广到日期 / 重复 /
 * 移动）：锚定在最后一个选中行，作用于 Selection 中的 task / project 行。
 * 多选时卡片不预选任何值（各条目取值不一），标签为三态。
 */
export function KeyboardFieldPicker({ kind, ids, onClose }: Props) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask();
  const updateProject = useUpdateProject();
  // 写入后行数据变化会重新登记，订阅以刷新卡片的当前值
  const scopes = useSelectionStore((s) => s.scopes);
  const targets = useMemo(() => fieldSelection(ids), [ids, scopes]);

  const anchorId = ids.at(-1);
  const anchorRef = useRef({
    getBoundingClientRect: () =>
      document.querySelector(`[data-selection-row="${anchorId}"]`)?.getBoundingClientRect() ??
      new DOMRect(),
  });

  const onError = () => toast.error(t('common:saveFailed'));
  // 字段卡片的写入对任务与项目同形（移动卡片按条目类型给出各自的 DTO）。
  const patch = (data: UpdateTaskDto | UpdateProjectDto) => {
    for (const target of targets) {
      if (target.kind === 'project') {
        updateProject.mutate({ id: target.id, data: data as UpdateProjectDto }, { onError });
      } else {
        updateTask.mutate({ id: target.id, data: data as UpdateTaskDto }, { onError });
      }
    }
  };

  const single = targets.length === 1 ? targets[0] : null;
  const current = single?.item ?? {};

  const body = () => {
    switch (kind) {
      case 'tags': {
        const kindById = new Map(targets.map((target) => [target.id, target.kind]));
        return (
          <MultiTagsField
            items={targets.flatMap(({ id, tagIds }) => (tagIds ? [{ id, tagIds }] : []))}
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
        );
      }
      case 'when':
        return (
          <ScheduledDateField
            current={current}
            onPatch={patch}
            onClose={onClose}
            showReminder={single?.kind === 'task' && getClientKind() !== 'web'}
          />
        );
      case 'deadline':
        return <DueDateField current={current} onPatch={patch} onClose={onClose} />;
      case 'repeat':
        return single ? <RepeatRuleField current={current} onPatch={patch} /> : null;
      case 'move':
        if (single?.kind === 'project') {
          return (
            <ProjectMovePicker
              current={{ areaId: single.item?.areaId ?? null }}
              onSelect={(data) => {
                patch(data);
                onClose();
              }}
            />
          );
        }
        return (
          <MovePicker
            current={current as MoveCurrent}
            onSelect={(data) => {
              patch(data);
              onClose();
            }}
          />
        );
    }
  };

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchorRef} />
      <PopoverContent align="start" className={kind === 'tags' ? 'w-64' : undefined}>
        {body()}
      </PopoverContent>
    </Popover>
  );
}
