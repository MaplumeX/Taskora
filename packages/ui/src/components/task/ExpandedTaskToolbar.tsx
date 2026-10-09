import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Copy,
  FolderInput,
  FolderTree,
  MoreHorizontal,
  Repeat,
  RotateCcw,
  SkipForward,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import type { UpdateTaskDto } from '@taskora/shared';
import { ScheduledType, TaskStatus } from '@taskora/shared';
import {
  useConvertTaskToProject,
  useDeleteTask,
  useRestoreTask,
  useSelectionStore,
  useTaskQuery,
  useUiInteractionStore,
  useUpdateTask,
} from '@taskora/api';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { FieldPickerDialog } from '@/components/common/FieldPicker';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ActionSheet,
  ActionSheetContent,
  ActionSheetItem,
  ActionSheetSeparator,
  ActionSheetTrigger,
} from '@/components/ui/action-sheet';
import { MovePicker } from './fields/MovePicker';
import { RepeatRuleField } from './fields/RepeatRuleField';
import { useSkipOccurrence } from './useSkipOccurrence';
import { useConvertGuard } from './useConvertGuard';
import { useDuplicate } from './useDuplicate';

type PickerKind = 'move' | 'repeat';

interface Props {
  /** bar：桌面底栏内联；floating：手机端悬浮胶囊（替代 FAB）。 */
  variant: 'bar' | 'floating';
}

/**
 * 任务展开时的底栏（对齐 Things 3）：底栏从「新建 / 搜索」切换为作用于
 * 展开任务的「移动 / 删除 / 更多」；收起即切回。Trash 中的任务「删除」换成
 * 「放回」。点击本栏不算「点到任务行以外」，展开态保持（见 useTaskRowSelection）。
 */
export function ExpandedTaskToolbar({ variant }: Props) {
  const { t } = useTranslation();
  const expandedId = useUiInteractionStore((s) => s.expandedId);
  const { data } = useTaskQuery(expandedId ?? '');
  const live = expandedId && data?.id === expandedId ? data : null;
  // 收起后仍保留最后展开的任务，让工具栏带着原按钮淡出，而不是瞬间清空。
  const [last, setLast] = React.useState(live);
  if (live && live !== last) setLast(live);
  const task = live ?? last;
  const shown = !!live;

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  const convertToProject = useConvertTaskToProject();
  const convertGuard = useConvertGuard();
  const duplicate = useDuplicate();

  const [moreOpen, setMoreOpen] = React.useState(false);
  const [picker, setPicker] = React.useState<PickerKind | null>(null);
  const skipOccurrence = useSkipOccurrence(task, moreOpen);
  // 回顾模式底部有回顾工具栏：悬浮胶囊让到它上方（同 FAB）。
  const inReview = useLocation().pathname.startsWith('/review/');

  if (!task) return null;

  const trashed = !!task.trashedAt;
  const settled = task.status !== TaskStatus.ACTIVE;
  const canRepeat = (task.scheduledType ?? ScheduledType.NONE) === ScheduledType.DATE;

  const collapse = () => {
    useUiInteractionStore.getState().setExpandedId(null);
    useSelectionStore.getState().clearSelection();
  };

  const patch = (patchData: UpdateTaskDto) =>
    updateTask.mutate(
      { id: task.id, data: patchData },
      { onError: () => toast.error(t('common:saveFailed')) },
    );

  const handleDelete = () => {
    deleteTask.mutate(task.id, { onError: () => toast.error(t('task:deleteFailed')) });
    collapse();
  };

  const handlePutBack = () => {
    restoreTask.mutate(task.id, { onError: () => toast.error(t('common:restoreFailed')) });
    collapse();
  };

  // 已了结的副本是未完成的，会落回原列表：不改选中（同右键菜单）。
  const handleDuplicate = () => {
    void duplicate([{ id: task.id, kind: 'task' }], { selectCopies: !settled });
  };

  const handleConvertToProject = () => {
    const id = task.id;
    void convertGuard.guard(id, () => {
      convertToProject.mutate(id, {
        onSuccess: () => toast.success(t('task:convertSuccess')),
        onError: () => toast.error(t('task:convertFailed')),
      });
      collapse();
    });
  };

  const pickerLabel: Record<PickerKind, string> = {
    move: t('task:move'),
    repeat: t('task:repeat'),
  };
  const pickerBody = (
    <>
      {picker === 'move' && (
        <MovePicker
          current={task}
          onSelect={(moveData) => {
            patch(moveData);
            setPicker(null);
            // 移走后任务多半离开当前列表：收起，不留悬空的展开态。
            useUiInteractionStore.getState().setExpandedId(null);
          }}
        />
      )}
      {picker === 'repeat' && <RepeatRuleField current={task} onPatch={patch} />}
    </>
  );

  const moreItems: MoreItem[] = [
    ...(canRepeat && !trashed
      ? [{ icon: Repeat, label: t('task:repeat'), onSelect: () => setPicker('repeat') }]
      : []),
    ...(skipOccurrence.available
      ? [
          {
            icon: SkipForward,
            label: t('task:skipOccurrence'),
            disabled: skipOccurrence.target === null,
            onSelect: skipOccurrence.skip,
          },
        ]
      : []),
    ...(!trashed
      ? [
          { icon: Copy, label: t('task:duplicate'), onSelect: handleDuplicate },
          {
            icon: FolderInput,
            label: t('task:convertToProject'),
            onSelect: handleConvertToProject,
            separated: true,
          },
        ]
      : []),
  ];

  const moveButton = { icon: FolderTree, label: t('task:move'), onClick: () => setPicker('move') };
  const removeButton = trashed
    ? { icon: RotateCcw, label: t('common:putBack'), onClick: handlePutBack }
    : { icon: Trash2, label: t('common:delete'), onClick: handleDelete };

  if (variant === 'bar') {
    return (
      <Popover open={picker !== null} onOpenChange={(open) => !open && setPicker(null)}>
        <PopoverAnchor asChild>
          <div data-expanded-task-toolbar className="flex items-center gap-2">
            {[moveButton, removeButton].map(({ icon: Icon, label, onClick }) => (
              <Hint key={label} label={label}>
                <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
                  <Icon className="h-5 w-5" />
                </Button>
              </Hint>
            ))}
            {moreItems.length > 0 && (
              <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
                <Hint label={t('common:more')}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t('common:more')}>
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                </Hint>
                <DropdownMenuContent
                  side="top"
                  align="center"
                  // 菜单项可能接着打开字段浮层：不把焦点还给触发按钮，免得浮层被当作外部点击关掉。
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  {moreItems.map(({ icon: Icon, label, disabled, onSelect, separated }) => (
                    <React.Fragment key={label}>
                      {separated && <DropdownMenuSeparator />}
                      <DropdownMenuItem disabled={disabled} onSelect={onSelect}>
                        <Icon className="h-4 w-4" />
                        {label}
                      </DropdownMenuItem>
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent side="top" align="center" className="p-1.5">
          {pickerBody}
        </PopoverContent>
        {convertGuard.dialog}
      </Popover>
    );
  }

  return (
    <div
      data-expanded-task-toolbar
      aria-hidden={!shown || undefined}
      // React 18 不认布尔 inert，传空串。
      {...(!shown && { inert: '' })}
      // 与多选工具栏同一悬浮胶囊体系；不跟随键盘上移（编辑时被键盘盖住，同 Things 3 iPhone）。
      // 展开时从底部弹起，收起时沉下淡出（与 FAB 的缩放交替）。
      className={cn(
        'fixed inset-x-3 z-40 mx-auto max-w-xs transition-[opacity,transform] duration-base ease-spring md:hidden',
        shown
          ? 'translate-y-0 opacity-100 animate-in fade-in-0 slide-in-from-bottom-4'
          : 'pointer-events-none translate-y-6 opacity-0',
        inReview
          ? 'bottom-[calc(5rem+var(--safe-area-bottom))]'
          : 'bottom-[calc(1.75rem+var(--safe-area-bottom))]',
      )}
    >
      <div className="flex h-14 items-center justify-around rounded-full border bg-background/85 px-1.5 shadow-popover backdrop-blur-xl">
        <FloatingButton {...moveButton} />
        <FloatingButton {...removeButton} className={cn(!trashed && 'text-destructive')} />
        {moreItems.length > 0 && (
          <ActionSheet open={moreOpen} onOpenChange={setMoreOpen}>
            <ActionSheetTrigger asChild>
              <FloatingButton icon={MoreHorizontal} label={t('common:more')} />
            </ActionSheetTrigger>
            <ActionSheetContent title={task.title || t('common:more')}>
              {moreItems.map(({ icon, label, disabled, onSelect, separated }) => (
                <React.Fragment key={label}>
                  {separated && <ActionSheetSeparator />}
                  <ActionSheetItem icon={icon} disabled={disabled} onClick={onSelect}>
                    {label}
                  </ActionSheetItem>
                </React.Fragment>
              ))}
            </ActionSheetContent>
          </ActionSheet>
        )}
      </div>
      <FieldPickerDialog
        label={picker ? pickerLabel[picker] : ''}
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
      >
        {pickerBody}
      </FieldPickerDialog>
      {convertGuard.dialog}
    </div>
  );
}

interface MoreItem {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
  /** 前面加分隔线。 */
  separated?: boolean;
}

interface FloatingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
}

const FloatingButton = React.forwardRef<HTMLButtonElement, FloatingButtonProps>(
  ({ icon: Icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors active:bg-accent',
        className,
      )}
      {...props}
    >
      <Icon className="h-[22px] w-[22px]" />
    </button>
  ),
);
FloatingButton.displayName = 'FloatingButton';
