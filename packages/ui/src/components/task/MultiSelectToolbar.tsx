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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { RepeatRuleField } from './fields/RepeatRuleField';
import { TagsField } from './fields/TagsField';
import { MoveField } from './fields/MoveField';

type PickerKind = 'scheduled' | 'move' | 'due' | 'tags' | 'repeat';

/**
 * 触控多选模式的底部工具栏（对齐 Things 3 iPhone）：左滑任务行进入模式后
 * 固定在页面底部，对勾选集合批量执行「计划 / 移动 / 删除」，其余动作收进
 * 「更多」。动作执行完即退出模式；切换页面、点「完成」、系统返回也会退出。
 *
 * 只作用于单个任务才有意义的动作（标签、重复、转换为项目）仅在勾选一项
 * 时出现：批量改写标签会覆盖各任务原有的标签集合。
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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between pl-4 pr-2 pt-1">
        <span className="text-meta text-muted-foreground">
          {t('task:multiSelectCount', { count: ids.length })}
        </span>
        <button
          type="button"
          onClick={exit}
          className="h-9 rounded-md px-3 text-sm font-medium text-primary active:bg-accent"
        >
          {t('common:done')}
        </button>
      </div>
      <div className="mx-auto grid max-w-3xl grid-cols-4 px-2 pb-1">
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
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton icon={MoreHorizontal} label={t('common:more')} disabled={empty} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-48">
            <DropdownMenuItem onClick={handleToggleComplete}>
              {allCompleted ? <Circle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {allCompleted ? t('task:markIncomplete') : t('task:markComplete')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleCancel}>
              <CircleSlash className="h-4 w-4" />
              {allCancelled ? t('task:markUncancelled') : t('task:markCancelled')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openPicker('due')}>
              <CalendarDays className="h-4 w-4" />
              {t('task:dueDate')}
            </DropdownMenuItem>
            {single && (
              <DropdownMenuItem onClick={() => openPicker('tags')}>
                <Tag className="h-4 w-4" />
                {t('task:tags')}
              </DropdownMenuItem>
            )}
            {canRepeat && (
              <DropdownMenuItem onClick={() => openPicker('repeat')}>
                <Repeat className="h-4 w-4" />
                {t('task:repeat')}
              </DropdownMenuItem>
            )}
            {single && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleConvertToProject}>
                  <FolderInput className="h-4 w-4" />
                  {t('task:convertToProject')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
          <MoveField
            current={current}
            onPatch={(data) => {
              patchAll(data);
              closePicker();
            }}
          />
        )}
        {picker === 'due' && (
          <DueDateField current={current} onPatch={patchAll} onClose={closePicker} />
        )}
        {picker === 'tags' && single && <TagsField current={single} onPatch={patchAll} />}
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
      className={cn(
        'flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-primary transition-colors active:bg-accent disabled:text-muted-foreground disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  ),
);
ToolbarButton.displayName = 'ToolbarButton';
