import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CalendarClock,
  CalendarDays,
  Check,
  Circle,
  CircleSlash,
  FolderInput,
  FolderTree,
  MoreHorizontal,
  Repeat,
  Tag,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import type { UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';
import {
  flattenSelectionRows,
  getClientKind,
  useCancelTask,
  useCompleteTask,
  useConvertTaskToProject,
  useDeleteTask,
  useMultiSelectStore,
  useSelectionStore,
  useTaskQuery,
  useUncancelTask,
  useUncompleteTask,
  useUpdateTask,
} from '@taskora/api';

import { cn } from '@/lib/utils';
import { FieldPickerDialog } from '@/components/common/FieldPicker';
import {
  ActionSheet,
  ActionSheetContent,
  ActionSheetItem,
  ActionSheetSeparator,
  ActionSheetTrigger,
} from '@/components/ui/action-sheet';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { RepeatRuleField } from './fields/RepeatRuleField';
import { MultiTagsField } from './fields/TagsField';
import { MovePicker } from './fields/MovePicker';

type PickerKind = 'scheduled' | 'move' | 'due' | 'tags' | 'repeat';

/**
 * 触控多选模式的底部工具栏（对齐 Things 3 iPhone）：左滑任务行进入模式后
 * 以悬浮胶囊浮在页面底部，对勾选集合批量执行「计划 / 移动 / 删除」，其余
 * 动作收进「更多」（底部 Action Sheet）。动作执行完即退出模式；切换页面、点「完成」、系统返回也会退出。
 *
 * 只作用于单个任务才有意义的动作（重复、转换为项目）仅在勾选一项时出现。
 * 标签按三态批量切换：各任务在自己原有的标签上增减（`.scratch/tags-things3`）。
 */
export function MultiSelectToolbar() {
  const { t } = useTranslation();
  const active = useMultiSelectStore((s) => s.active);
  const ids = useMultiSelectStore((s) => s.ids);
  const exit = useMultiSelectStore((s) => s.exit);
  // 订阅各列表登记的行（完成 / 取消态），变化时重渲染；读取见下方 rowById。
  useSelectionStore((s) => s.scopes);
  const { pathname } = useLocation();

  // 多选只在当前页内有意义：切换页面即退出。
  const pathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    if (pathnameRef.current === pathname) return;
    pathnameRef.current = pathname;
    useMultiSelectStore.getState().exit();
  }, [pathname]);

  const singleId = ids.length === 1 ? ids[0] : '';
  const { data: singleTask } = useTaskQuery(singleId);
  const single = singleId && singleTask?.id === singleId ? singleTask : null;

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const cancelTask = useCancelTask();
  const uncancelTask = useUncancelTask();
  const convertToProject = useConvertTaskToProject();

  const [picker, setPicker] = React.useState<PickerKind | null>(null);
  // 字段卡片关闭时：改过字段 → 视为动作完成、退出模式；未改 → 留在模式中。
  const patchedRef = React.useRef(false);

  if (!active) return null;

  // 各列表经 useSelectionScope 登记了行的完成 / 取消态（与键盘批量动作同源）。
  const rowById = new Map(
    flattenSelectionRows(useSelectionStore.getState()).map((row) => [row.id, row]),
  );
  const empty = ids.length === 0;
  const allCompleted = !empty && ids.every((id) => rowById.get(id)?.completed);
  const allCancelled = !empty && ids.every((id) => rowById.get(id)?.cancelled);
  const onError = () => toast.error(t('common:saveFailed'));

  const patchAll = (data: UpdateTaskDto) => {
    patchedRef.current = true;
    for (const id of ids) updateTask.mutate({ id, data }, { onError });
  };

  const openPicker = (kind: PickerKind) => {
    patchedRef.current = false;
    setPicker(kind);
  };

  const closePicker = () => {
    setPicker(null);
    if (patchedRef.current) exit();
  };

  const handleDelete = () => {
    for (const id of ids) {
      deleteTask.mutate(id, { onError: () => toast.error(t('task:deleteFailed')) });
    }
    exit();
  };

  const handleToggleComplete = () => {
    for (const id of ids) {
      if (allCompleted) uncompleteTask.mutate(id, { onError });
      else if (!rowById.get(id)?.completed) completeTask.mutate(id, { onError });
    }
    exit();
  };

  // 与右键菜单一致：终态可直接改写（ADR 0006）。
  const handleToggleCancel = () => {
    for (const id of ids) {
      if (allCancelled) uncancelTask.mutate(id, { onError });
      else if (!rowById.get(id)?.cancelled) cancelTask.mutate(id, { onError });
    }
    exit();
  };

  const handleConvertToProject = () => {
    if (!single) return;
    convertToProject.mutate(single.id, {
      onSuccess: () => toast.success(t('task:convertSuccess')),
      onError: () => toast.error(t('task:convertFailed')),
    });
    exit();
  };

  // 勾选多项时字段卡片不预选任何值（各任务取值不一）。
  const current = single ?? {};
  const pickerLabel: Record<PickerKind, string> = {
    scheduled: t('task:multiSelectSchedule'),
    move: t('task:move'),
    due: t('task:dueDate'),
    tags: t('task:tags'),
    repeat: t('task:repeat'),
  };
  const canRepeat = !!single && (single.scheduledType ?? ScheduledType.NONE) === ScheduledType.DATE;

  return (
    <div
      data-multi-select-toolbar
      // 悬浮胶囊：从 FAB 所在的右下角展开，与 FAB 同属浮层体系。
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md origin-bottom-right duration-base ease-spring animate-in fade-in-0 zoom-in-90 slide-in-from-bottom-4"
    >
      <div className="flex h-14 items-center gap-1 rounded-full border bg-background/85 pl-3 pr-1.5 shadow-popover backdrop-blur-xl">
        {/* key 随数量变化重挂载，勾选增减时数字弹一下。 */}
        <span
          key={ids.length}
          role="status"
          aria-label={t('task:multiSelectCount', { count: ids.length })}
          className="flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-primary px-2 text-sm font-semibold tabular-nums text-primary-foreground duration-fast animate-in zoom-in-75"
        >
          {ids.length}
        </span>
        <div className="flex flex-1 items-center justify-around">
          <ToolbarButton
            icon={CalendarClock}
            label={t('task:multiSelectSchedule')}
            disabled={empty}
            onClick={() => openPicker('scheduled')}
          />
          <ToolbarButton
            icon={FolderTree}
            label={t('task:move')}
            disabled={empty}
            onClick={() => openPicker('move')}
          />
          <ToolbarButton
            icon={Trash2}
            label={t('common:delete')}
            disabled={empty}
            onClick={handleDelete}
            className="text-destructive"
          />
          <ActionSheet>
            <ActionSheetTrigger asChild>
              <ToolbarButton icon={MoreHorizontal} label={t('common:more')} disabled={empty} />
            </ActionSheetTrigger>
            <ActionSheetContent title={t('task:multiSelectCount', { count: ids.length })}>
              <ActionSheetItem icon={allCompleted ? Circle : Check} onClick={handleToggleComplete}>
                {allCompleted ? t('task:markIncomplete') : t('task:markComplete')}
              </ActionSheetItem>
              <ActionSheetItem icon={CircleSlash} onClick={handleToggleCancel}>
                {allCancelled ? t('task:markUncancelled') : t('task:markCancelled')}
              </ActionSheetItem>
              <ActionSheetSeparator />
              <ActionSheetItem icon={CalendarDays} onClick={() => openPicker('due')}>
                {t('task:dueDate')}
              </ActionSheetItem>
              <ActionSheetItem icon={Tag} onClick={() => openPicker('tags')}>
                {t('task:tags')}
              </ActionSheetItem>
              {canRepeat && (
                <ActionSheetItem icon={Repeat} onClick={() => openPicker('repeat')}>
                  {t('task:repeat')}
                </ActionSheetItem>
              )}
              {single && (
                <>
                  <ActionSheetSeparator />
                  <ActionSheetItem icon={FolderInput} onClick={handleConvertToProject}>
                    {t('task:convertToProject')}
                  </ActionSheetItem>
                </>
              )}
            </ActionSheetContent>
          </ActionSheet>
        </div>
        <button
          type="button"
          onClick={exit}
          className="h-10 shrink-0 rounded-full bg-primary/10 px-4 text-sm font-medium text-primary transition-colors active:bg-primary/20"
        >
          {t('common:done')}
        </button>
      </div>

      <FieldPickerDialog
        label={picker ? pickerLabel[picker] : ''}
        open={picker !== null}
        onOpenChange={(open) => !open && closePicker()}
      >
        {picker === 'scheduled' && (
          <ScheduledDateField
            current={current}
            onPatch={patchAll}
            onClose={closePicker}
            showReminder={!!single && getClientKind() !== 'web'}
          />
        )}
        {picker === 'move' && (
          <MovePicker
            current={current}
            onSelect={(data) => {
              patchAll(data);
              closePicker();
            }}
          />
        )}
        {picker === 'due' && (
          <DueDateField current={current} onPatch={patchAll} onClose={closePicker} />
        )}
        {picker === 'tags' && (
          <MultiTagsField
            items={ids.map((id) => ({ id, tagIds: rowById.get(id)?.tagIds ?? [] }))}
            onChanges={(changes) => {
              patchedRef.current = true;
              for (const { id, tagIds } of changes) {
                updateTask.mutate({ id, data: { tagIds } }, { onError });
              }
            }}
          />
        )}
        {picker === 'repeat' && single && <RepeatRuleField current={single} onPatch={patchAll} />}
      </FieldPickerDialog>
    </div>
  );
}

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
}

const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ icon: Icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors active:bg-accent disabled:text-muted-foreground disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <Icon className="h-[22px] w-[22px]" />
    </button>
  ),
);
ToolbarButton.displayName = 'ToolbarButton';
