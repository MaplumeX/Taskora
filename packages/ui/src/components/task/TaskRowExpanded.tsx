import * as React from 'react';
import {
  Calendar,
  CircleSlash,
  Flag,
  ListPlus,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { SubtaskResponseDto, TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { Input } from '@/components/ui/input';
import { MarkdownNotesEditor } from '@/components/common/MarkdownNotesEditor';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { FieldPicker } from '@/components/common/FieldPicker';
import { MenuRow } from '@/components/common/MenuRow';
import { useLongPress } from '../../lib/useLongPress';
import { cn } from '@/lib/utils';
import {
  formatDeadlineCountdown,
  formatShortDate,
  getClientKind,
  isOverdue,
  isToday,
  parseCalendarDate,
  startOfTomorrow,
  useCancelSubtask,
  useCompleteSubtask,
  useCreateSubtask,
  useDeleteSubtask,
  useUncancelSubtask,
  useUncompleteSubtask,
  useUpdateSubtask,
  useUpdateTask,
} from '@taskora/api';
import { toast } from 'sonner';
import { ScheduledDateField } from './fields/ScheduledDateField';
import { DueDateField } from './fields/DueDateField';
import { TagsField } from './fields/TagsField';
import { TaskCheckbox } from './TaskCheckbox';

interface Props {
  task: TaskResponseDto;
  current: TaskResponseDto;
}

export function TaskRowExpanded({ task, current }: Props) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask();
  const createSubtask = useCreateSubtask();

  const [notes, setNotes] = React.useState(current.notes ?? '');
  const [subtaskTitle, setSubtaskTitle] = React.useState('');

  const subtasks = current.subtasks ?? [];
  const [subtasksOpen, setSubtasksOpen] = React.useState(subtasks.length > 0);
  const subtaskInputRef = React.useRef<HTMLInputElement>(null);

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;

  const patch = (data: UpdateTaskDto) =>
    updateTask.mutate(
      { id: task.id, data },
      { onError: () => toast.error(t('common:saveFailed')) },
    );

  const commitNotes = () => {
    if (notes !== (current.notes ?? '')) patch({ notes });
  };

  const addSubtask = () => {
    const trimmed = subtaskTitle.trim();
    if (!trimmed) return;
    createSubtask.mutate(
      {
        taskId: task.id,
        data: { title: trimmed },
      },
      {
        onSuccess: () => setSubtaskTitle(''),
        onError: () => toast.error(t('task:subtaskCreateFailed')),
      },
    );
  };

  const openSubtasks = () => {
    setSubtasksOpen(true);
    requestAnimationFrame(() => subtaskInputRef.current?.focus());
  };

  // 已设值字段在左下显示为 chip（点击打开同一编辑器），未设值字段在右下为图标
  // （Things 3 展开任务的底栏）。
  const scheduledChip = (() => {
    if (scheduledType === ScheduledType.SOMEDAY) return { text: t('nav:someday') };
    if (scheduledType !== ScheduledType.DATE || !current.scheduledDate) return null;
    const date = parseCalendarDate(current.scheduledDate);
    const onOrBeforeToday = date < startOfTomorrow();
    const label = onOrBeforeToday ? t('common:today') : formatShortDate(date);
    return {
      text: current.reminderTime ? `${label} ${current.reminderTime}` : label,
      icon: onOrBeforeToday ? <Star className="h-3.5 w-3.5 fill-today text-today" /> : undefined,
    };
  })();
  const dueDate = current.dueDate ? parseCalendarDate(current.dueDate) : null;
  const tags = current.tags ?? [];

  return (
    <div
      className="flex flex-col gap-3 px-2 pb-2 pl-[2.375rem] pt-1 max-md:pl-2"
      onClick={(e) => e.stopPropagation()}
    >
      <MarkdownNotesEditor
        value={notes}
        onChange={setNotes}
        onBlurCommit={commitNotes}
        placeholder={t('task:notePlaceholder')}
      />

      {subtasksOpen && (
        <div className="flex flex-col gap-1">
          <h3 className="text-meta font-medium text-muted-foreground">
            {subtasks.length > 0
              ? `${t('task:subtasks')} (${subtasks.length})`
              : t('task:subtasks')}
          </h3>
          {subtasks.length > 0 && (
            <ul className="flex flex-col">
              {subtasks.map((c) => (
                <SubtaskRow key={c.id} subtask={c} taskId={task.id} />
              ))}
            </ul>
          )}
          <Input
            ref={subtaskInputRef}
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                addSubtask();
              } else if (e.key === ' ') {
                e.stopPropagation();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder={t('task:addSubtask')}
            className="h-7 border-0 bg-transparent px-0 text-body shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {scheduledChip && (
          <FieldChip
            label={t('task:scheduledDate')}
            icon={scheduledChip.icon ?? <Calendar />}
            text={scheduledChip.text}
          >
            {(close) => (
              <ScheduledDateField
                current={current}
                onPatch={patch}
                onClose={close}
                showReminder={getClientKind() !== 'web'}
              />
            )}
          </FieldChip>
        )}
        {tags.length > 0 && (
          <FieldChip
            label={t('task:tags')}
            icon={<Tag />}
            text={tags.map((tag) => tag.title).join(', ')}
          >
            <TagsField current={current} onPatch={patch} />
          </FieldChip>
        )}
        {dueDate && (
          <FieldChip
            label={t('task:dueDate')}
            icon={<Flag />}
            text={formatDeadlineCountdown(dueDate)}
            urgent={isOverdue(dueDate) || isToday(dueDate)}
          >
            {(close) => <DueDateField current={current} onPatch={patch} onClose={close} />}
          </FieldChip>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {!scheduledChip && (
            <IconPopover label={t('task:scheduledDate')} icon={<Calendar className="h-4 w-4" />}>
              {(close) => (
                <ScheduledDateField
                  current={current}
                  onPatch={patch}
                  onClose={close}
                  showReminder={getClientKind() !== 'web'}
                />
              )}
            </IconPopover>
          )}

          {tags.length === 0 && (
            <IconPopover label={t('task:tags')} icon={<Tag className="h-4 w-4" />}>
              <TagsField current={current} onPatch={patch} />
            </IconPopover>
          )}

          {subtasks.length === 0 && (
            <Hint label={t('task:addSubtask')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
                aria-label={t('task:addSubtask')}
                onClick={(e) => {
                  e.stopPropagation();
                  openSubtasks();
                }}
              >
                <ListPlus className="h-4 w-4" />
              </Button>
            </Hint>
          )}

          {!dueDate && (
            <IconPopover label={t('task:dueDate')} icon={<Flag className="h-4 w-4" />}>
              {(close) => <DueDateField current={current} onPatch={patch} onClose={close} />}
            </IconPopover>
          )}
        </div>
      </div>
    </div>
  );
}

/** 已设值字段的 chip：图标 + 值文案，点击打开字段编辑器。 */
function FieldChip({
  label,
  icon,
  text,
  urgent,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  text: string;
  urgent?: boolean;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  return (
    <FieldPicker
      label={label}
      tooltip
      trigger={
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-md bg-muted px-2 text-meta font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
            urgent ? 'text-deadline' : 'text-foreground [&_svg]:text-muted-foreground',
          )}
        >
          {icon}
          <span className="truncate">{text}</span>
        </button>
      }
    >
      {children}
    </FieldPicker>
  );
}

function IconPopover({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  return (
    <FieldPicker
      label={label}
      tooltip
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
          aria-label={label}
        >
          {icon}
        </Button>
      }
    >
      {children}
    </FieldPicker>
  );
}

function SubtaskRow({ subtask, taskId }: { subtask: SubtaskResponseDto; taskId: string }) {
  const { t } = useTranslation();
  const { t: tc } = useTranslation('common');
  const completeSubtask = useCompleteSubtask();
  const uncompleteSubtask = useUncompleteSubtask();
  const cancelSubtask = useCancelSubtask();
  const uncancelSubtask = useUncancelSubtask();
  const deleteSubtask = useDeleteSubtask();
  const updateSubtask = useUpdateSubtask();
  const completed = subtask.status === 'COMPLETED';
  const cancelled = subtask.status === 'CANCELLED';
  const settled = completed || cancelled;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(subtask.title);
  // 右键菜单（取消/撤销取消）：勾选框仍只管完成/重开，取消只走菜单（story 22）。
  const [menuOpen, setMenuOpen] = React.useState(false);
  const virtualAnchorRef = React.useRef<{ getBoundingClientRect: () => ClientRect } | null>(null);

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
    setMenuOpen(true);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  };

  // 触屏长按与右键走同一菜单（取消/撤销取消）。
  const longPress = useLongPress((p) => openMenuAt(p.x, p.y));

  const toggleCancel = () => {
    setMenuOpen(false);
    (cancelled ? uncancelSubtask : cancelSubtask).mutate(subtask.id, {
      onError: () => toast.error(tc('saveFailed')),
    });
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== subtask.title) {
      updateSubtask.mutate(
        { id: subtask.id, data: { title: trimmed } },
        { onError: () => toast.error(t('common:saveFailed')) },
      );
    } else {
      setDraft(subtask.title);
    }
    setEditing(false);
  };

  return (
    <li
      className="group/subtask flex min-h-7 items-center gap-2 text-body max-md:min-h-11"
      onContextMenu={onContextMenu}
      {...longPress}
    >
      <TaskCheckbox
        className="h-3 w-3 rounded-full"
        checked={completed}
        cancelled={cancelled}
        onToggle={() => (completed ? uncompleteSubtask : completeSubtask).mutate(subtask.id)}
      />
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              e.currentTarget.blur();
            } else if (e.key === ' ') {
              e.stopPropagation();
            } else if (e.key === 'Escape') {
              setDraft(subtask.title);
              setEditing(false);
            }
          }}
          className="h-7 flex-1 border-0 bg-transparent px-0 text-body font-normal shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(subtask.title);
            setEditing(true);
          }}
          className={cn(
            'flex-1 text-left',
            settled && 'text-muted-foreground',
            cancelled && 'line-through',
          )}
        >
          {subtask.title}
        </button>
      )}

      {/* 右键菜单：取消 / 撤销取消（story 20）。 */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent align="start" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
          <MenuRow icon={CircleSlash} onClick={toggleCancel}>
            {cancelled ? t('task:markUncancelled') : t('task:markCancelled')}
          </MenuRow>
        </PopoverContent>
      </Popover>
      <Hint label={t('common:delete')}>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover/subtask:opacity-100 max-md:h-11 max-md:w-11 max-md:opacity-100"
          aria-label={t('common:delete')}
          onClick={(e) => {
            e.stopPropagation();
            deleteSubtask.mutate({ id: subtask.id, taskId });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Hint>
    </li>
  );
}
