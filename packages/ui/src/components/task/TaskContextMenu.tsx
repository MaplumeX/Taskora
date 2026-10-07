import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Check,
  Circle,
  CircleSlash,
  CalendarClock,
  CalendarDays,
  FolderTree,
  Repeat,
  Tag,
  FolderInput,
  Trash2,
  RotateCcw,
  SkipForward,
} from 'lucide-react';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { MenuRow } from '@/components/common/MenuRow';
import { isTouchContextMenu } from '../../lib/useLongPress';
import {
  contextMenuTargets,
  flattenSelectionRows,
  getClientKind,
  useCancelTask,
  useCompleteTask,
  useConvertTaskToProject,
  useDeleteTask,
  useRestoreTask,
  useSelectionStore,
  useUncancelTask,
  useUncompleteTask,
  useUpdateTask,
} from '@taskora/api';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { RepeatRuleField } from './fields/RepeatRuleField';
import { MultiTagsField, TagsField } from './fields/TagsField';
import { MovePicker } from './fields/MovePicker';
import { useSkipOccurrence } from './useSkipOccurrence';

interface Props {
  task: TaskResponseDto;
  current: TaskResponseDto;
  children: React.ReactNode;
  variant?: 'default' | 'trash';
}

type PickerKind = 'scheduled' | 'repeat' | 'due' | 'tags' | 'move' | null;

/** 各列表经 useSelectionScope 登记的行（完成 / 取消态、自身 Tag），与键盘批量动作同源。 */
function selectionRowsById() {
  return new Map(flattenSelectionRows(useSelectionStore.getState()).map((row) => [row.id, row]));
}

/** 整组是否全部已完成 / 全部已取消。 */
function statusOfGroup(ids: string[]) {
  const rows = selectionRowsById();
  return {
    completed: ids.every((id) => rows.get(id)?.completed),
    cancelled: ids.every((id) => rows.get(id)?.cancelled),
  };
}

export function TaskContextMenu({ task, current, children, variant = 'default' }: Props) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');

  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const cancelTask = useCancelTask();
  const uncancelTask = useUncancelTask();
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  const convertToProjectTask = useConvertTaskToProject();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);
  // 右键在多选之中时作用于整组（打开菜单时取快照），否则为 null、只作用于本行。
  const [group, setGroup] = React.useState<string[] | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const firstItemRef = React.useRef<HTMLButtonElement>(null);
  const virtualAnchorRef = React.useRef<{ getBoundingClientRect: () => ClientRect } | null>(null);

  // 整组：全部已完成 / 已取消时为撤销，否则只作用于尚未完成 / 取消的项（同触控多选工具栏）。
  const groupStatus = group ? statusOfGroup(group) : null;
  const completed = groupStatus ? groupStatus.completed : current.status === 'COMPLETED';
  const cancelled = groupStatus ? groupStatus.cancelled : current.status === 'CANCELLED';
  const isDate = (current.scheduledType ?? ScheduledType.NONE) === ScheduledType.DATE;

  // 跳过本次：链已到头（until）时禁用。
  const skipOccurrence = useSkipOccurrence(current, menuOpen);
  const canOfferSkip = !group && variant === 'default' && skipOccurrence.available;
  const skipTarget = skipOccurrence.target;

  const targets = group ?? [task.id];
  // 整组时字段卡片不预选任何值（各任务取值不一）。
  const fieldCurrent = group ? {} : current;
  const onError = () => toast.error(tc('saveFailed'));

  const patch = (data: UpdateTaskDto) => {
    for (const id of targets) updateTask.mutate({ id, data }, { onError });
  };

  const closeMenu = () => setMenuOpen(false);

  const handleToggleComplete = () => {
    closeMenu();
    const rows = selectionRowsById();
    for (const id of targets) {
      if (completed) uncompleteTask.mutate(id, { onError });
      else if (!group || !rows.get(id)?.completed) completeTask.mutate(id, { onError });
    }
  };

  // 取消与完成对称：终态可直接改写（ADR 0006），随当前状态切换文案。
  const handleToggleCancel = () => {
    closeMenu();
    const rows = selectionRowsById();
    for (const id of targets) {
      if (cancelled) uncancelTask.mutate(id, { onError });
      else if (!group || !rows.get(id)?.cancelled) cancelTask.mutate(id, { onError });
    }
  };

  const handleSkip = () => {
    closeMenu();
    skipOccurrence.skip();
  };

  const handleDelete = () => {
    closeMenu();
    for (const id of targets) {
      deleteTask.mutate(id, { onError: () => toast.error(t('deleteFailed')) });
    }
    if (group) useSelectionStore.getState().clearSelection();
  };

  const handleRestore = () => {
    closeMenu();
    for (const id of targets) {
      restoreTask.mutate(id, { onError: () => toast.error(tc('restoreFailed')) });
    }
    if (group) useSelectionStore.getState().clearSelection();
  };

  const handleConvertToProject = () => {
    closeMenu();
    convertToProjectTask.mutate(task.id, {
      onSuccess: () => toast.success(t('convertSuccess')),
      onError: () => toast.error(t('convertFailed')),
    });
  };

  const openPicker = (kind: PickerKind) => {
    closeMenu();
    setActivePicker(kind);
  };

  /** 以坐标为锚点打开主菜单。 */
  const openMenuAt = (x: number, y: number) => {
    virtualAnchorRef.current = {
      getBoundingClientRect: () =>
        ({
          width: 0,
          height: 0,
          x,
          y,
          top: y,
          right: x,
          bottom: y,
          left: x,
          toJSON: () => ({}),
        }) as ClientRect,
    };
    setActivePicker(null);
    setMenuOpen(true);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // 触屏长按派发的 contextmenu 不开菜单：长按只负责拖动（对齐 Things 3），
    // 操作走左滑多选工具栏（Trash 行同样如此，工具栏提供「放回」）。
    if (isTouchContextMenu(e)) return;
    const ids = contextMenuTargets(task.id);
    setGroup(ids.length > 1 ? ids : null);
    openMenuAt(e.clientX, e.clientY);
  };

  // Auto-focus first menu item when opened.
  React.useEffect(() => {
    if (menuOpen) {
      const id = requestAnimationFrame(() => firstItemRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="flex flex-col" onContextMenu={onContextMenu}>
      {children}

      {/* Main context menu (anchored to the right-click coordinates). */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent align="start" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
          {group && (
            <div className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">
              {t('multiSelectCount', { count: group.length })}
            </div>
          )}
          <MenuRow
            ref={firstItemRef}
            icon={completed ? Circle : Check}
            onClick={handleToggleComplete}
          >
            {completed ? t('markIncomplete') : t('markComplete')}
          </MenuRow>
          <MenuRow icon={CircleSlash} onClick={handleToggleCancel}>
            {cancelled ? t('markUncancelled') : t('markCancelled')}
          </MenuRow>
          <div className="-mx-1 my-1 h-px bg-muted" />
          <MenuRow icon={CalendarClock} onClick={() => openPicker('scheduled')}>
            {t('scheduledDate')}
          </MenuRow>
          {/* 重复规则是独立入口：仅 DATE 型任务显示（规则需要计划日期作锚点）。 */}
          {!group && isDate && (
            <MenuRow icon={Repeat} onClick={() => openPicker('repeat')}>
              {t('repeat')}
            </MenuRow>
          )}
          {canOfferSkip && (
            <MenuRow
              icon={SkipForward}
              disabled={skipTarget === null}
              title={skipTarget === null ? t('skipOccurrenceLast') : undefined}
              onClick={handleSkip}
            >
              {t('skipOccurrence')}
            </MenuRow>
          )}
          <MenuRow icon={CalendarDays} onClick={() => openPicker('due')}>
            {t('dueDate')}
          </MenuRow>
          <MenuRow icon={Tag} onClick={() => openPicker('tags')}>
            {t('tags')}
          </MenuRow>
          {/* 移动：更改所在位置（Inbox / 区域 / 项目），见 MovePicker。 */}
          <MenuRow icon={FolderTree} onClick={() => openPicker('move')}>
            {t('move')}
          </MenuRow>
          {!group && variant === 'default' && (
            <>
              <div className="-mx-1 my-1 h-px bg-muted" />
              <MenuRow icon={FolderInput} onClick={handleConvertToProject}>
                {t('convertToProject')}
              </MenuRow>
            </>
          )}
          <div className="-mx-1 my-1 h-px bg-muted" />
          <MenuRow
            icon={variant === 'trash' ? RotateCcw : Trash2}
            destructive
            onClick={variant === 'trash' ? handleRestore : handleDelete}
          >
            {variant === 'trash' ? tc('putBack') : tc('delete')}
          </MenuRow>
        </PopoverContent>
      </Popover>

      {/* Picker popover (anchored to the row container). */}
      <Popover open={activePicker !== null} onOpenChange={(o) => !o && setActivePicker(null)}>
        <PopoverAnchor virtualRef={containerRef} />
        <PopoverContent align="start" onClick={(e) => e.stopPropagation()}>
          {activePicker === 'scheduled' && (
            <ScheduledDateField
              current={fieldCurrent}
              onPatch={patch}
              onClose={() => setActivePicker(null)}
              showReminder={!group && getClientKind() !== 'web'}
            />
          )}
          {activePicker === 'repeat' && <RepeatRuleField current={current} onPatch={patch} />}
          {activePicker === 'due' && (
            <DueDateField
              current={fieldCurrent}
              onPatch={patch}
              onClose={() => setActivePicker(null)}
            />
          )}
          {activePicker === 'tags' &&
            (group ? (
              <GroupTagsField ids={group} />
            ) : (
              <TagsField current={current} onPatch={patch} />
            ))}
          {activePicker === 'move' && (
            <MovePicker
              current={fieldCurrent}
              onSelect={(data) => {
                patch(data);
                setActivePicker(null);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** 整组批量打标（三态）：各任务在自己原有的标签上增减；订阅登记行，打标后三态随之刷新。 */
function GroupTagsField({ ids }: { ids: string[] }) {
  const { t: tc } = useTranslation('common');
  const updateTask = useUpdateTask();
  useSelectionStore((s) => s.scopes);
  const rows = selectionRowsById();
  return (
    <MultiTagsField
      items={ids.map((id) => ({ id, tagIds: rows.get(id)?.tagIds ?? [] }))}
      onChanges={(changes) => {
        for (const { id, tagIds } of changes) {
          updateTask.mutate(
            { id, data: { tagIds } },
            { onError: () => toast.error(tc('saveFailed')) },
          );
        }
      }}
    />
  );
}
