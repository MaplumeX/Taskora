import * as React from 'react';
import { Calendar, CircleSlash, Clock, ListPlus, Repeat, Tag, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { SubtaskResponseDto, TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { Input } from '@/components/ui/input';
import { MarkdownNotesEditor } from '@/components/common/MarkdownNotesEditor';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MenuRow } from '@/components/common/MenuRow';
import { useLongPress } from '../../lib/useLongPress';
import { cn } from '@/lib/utils';
import {
  getClientKind,
  taskKeys,
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
import { RepeatRuleField } from './fields/RepeatRuleField';
import { TagsField } from './fields/TagsField';
import { TaskCheckbox } from './TaskCheckbox';

interface Props {
  task: TaskResponseDto;
  current: TaskResponseDto;
}

export function TaskRowExpanded({ task, current }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const updateTask = useUpdateTask();
  const createSubtask = useCreateSubtask();

  const [notes, setNotes] = React.useState(current.notes ?? '');
  const [subtaskTitle, setSubtaskTitle] = React.useState('');

  const subtasks = current.subtasks ?? [];
  const [subtasksOpen, setSubtasksOpen] = React.useState(subtasks.length > 0);
  const subtaskInputRef = React.useRef<HTMLInputElement>(null);

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;

  const invalidateParent = () =>
    queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });

  const patch = (data: UpdateTaskDto) =>
    updateTask.mutate(
      { id: task.id, data },
      {
        onSuccess: () => {
          invalidateParent();
          void queryClient.invalidateQueries({ queryKey: ['tasks'] });
        },
        onError: () => toast.error(t('common:saveFailed')),
      },
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
        onSuccess: () => {
          setSubtaskTitle('');
          invalidateParent();
        },
        onError: () => toast.error(t('task:subtaskCreateFailed')),
      },
    );
  };

  const openSubtasks = () => {
    setSubtasksOpen(true);
    requestAnimationFrame(() => subtaskInputRef.current?.focus());
  };

  return (
    <div className="flex flex-col gap-3 px-2 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
      <MarkdownNotesEditor
        value={notes}
        onChange={setNotes}
        onBlurCommit={commitNotes}
        placeholder={t('task:notePlaceholder')}
      />

      <Separator />

      {subtasksOpen && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {subtasks.length > 0
              ? `${t('task:subtasks')} (${subtasks.length})`
              : t('task:subtasks')}
          </h3>
          {subtasks.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {subtasks.map((c) => (
                <SubtaskRow key={c.id} subtask={c} taskId={task.id} onMutated={invalidateParent} />
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
            className="mt-1 h-8 text-sm"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <IconPopover
          label={t('task:scheduledDate')}
          icon={<Calendar className="h-4 w-4" />}
          active={scheduledType !== ScheduledType.NONE}
        >
          {(close) => (
            <ScheduledDateField
              current={current}
              onPatch={patch}
              onClose={close}
              showReminder={getClientKind() !== 'web'}
            />
          )}
        </IconPopover>

        {/* 重复规则是独立入口（不内嵌于计划 popover）：仅 DATE 型任务
            显示（规则需要计划日期作锚点，Someday/NONE 不提供该选项）。 */}
        {scheduledType === ScheduledType.DATE && (
          <IconPopover
            label={t('task:repeat')}
            icon={<Repeat className="h-4 w-4" />}
            active={!!current.repeatRule}
          >
            <RepeatRuleField current={current} onPatch={patch} />
          </IconPopover>
        )}

        <IconPopover
          label={t('task:dueDate')}
          icon={<Clock className="h-4 w-4" />}
          active={!!current.dueDate}
        >
          {(close) => <DueDateField current={current} onPatch={patch} onClose={close} />}
        </IconPopover>

        <IconPopover
          label={t('task:tags')}
          icon={<Tag className="h-4 w-4" />}
          active={(current.tags ?? []).length > 0}
        >
          <TagsField current={current} onPatch={patch} />
        </IconPopover>

        {subtasks.length === 0 && (
          <Hint label={t('task:addSubtask')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground max-md:h-11 max-md:w-11"
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
      </div>
    </div>
  );
}

function IconPopover({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={label}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 max-md:h-11 max-md:w-11',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-label={label}
          >
            {icon}
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="start">
        {typeof children === 'function' ? children(() => setOpen(false)) : children}
      </PopoverContent>
    </Popover>
  );
}

function SubtaskRow({
  subtask,
  taskId,
  onMutated,
}: {
  subtask: SubtaskResponseDto;
  taskId: string;
  onMutated: () => void;
}) {
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
      onSuccess: onMutated,
      onError: () => toast.error(tc('saveFailed')),
    });
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== subtask.title) {
      updateSubtask.mutate(
        { id: subtask.id, data: { title: trimmed } },
        { onSuccess: onMutated, onError: () => toast.error(t('common:saveFailed')) },
      );
    } else {
      setDraft(subtask.title);
    }
    setEditing(false);
  };

  return (
    <li className="flex items-center gap-2 text-sm" onContextMenu={onContextMenu} {...longPress}>
      <TaskCheckbox
        checked={completed}
        cancelled={cancelled}
        onToggle={() =>
          (completed ? uncompleteSubtask : completeSubtask).mutate(subtask.id, {
            onSuccess: onMutated,
          })
        }
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
          className="h-8 flex-1 border-0 px-0 text-sm font-normal shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(subtask.title);
            setEditing(true);
          }}
          className={cn('flex-1 text-left', settled && 'text-muted-foreground line-through')}
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
          className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive max-md:h-11 max-md:w-11"
          aria-label={t('common:delete')}
          onClick={(e) => {
            e.stopPropagation();
            deleteSubtask.mutate({ id: subtask.id, taskId }, { onSuccess: onMutated });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Hint>
    </li>
  );
}
