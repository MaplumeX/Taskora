import * as React from 'react';
import {
  Calendar,
  Check,
  Clock,
  Folder,
  ListPlus,
  Tag,
  Target,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { SubtaskResponseDto, TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
import { ScheduledType } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import {
  taskKeys,
  useCompleteSubtask,
  useCreateSubtask,
  useDeleteSubtask,
  useUncompleteSubtask,
  useUpdateSubtask,
  useUpdateTask,
} from '@/lib/hooks/useTasks';
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
  const queryClient = useQueryClient();

  const updateTask = useUpdateTask();
  const createSubtask = useCreateSubtask();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();

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
    <div
      className="flex flex-col gap-3 px-2 pb-3 pt-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={commitNotes}
        onKeyDown={(e) =>
          (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()
        }
        placeholder={t('task:notePlaceholder')}
        className="min-h-[60px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
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

      <div className="flex items-center gap-1">
        <IconPopover
          label={t('task:scheduledDate')}
          icon={<Calendar className="h-4 w-4" />}
          active={scheduledType !== ScheduledType.NONE}
        >
          {(close) => (
            <ScheduledDateField current={current} onPatch={patch} onClose={close} />
          )}
        </IconPopover>

        <IconPopover
          label={t('task:dueDate')}
          icon={<Clock className="h-4 w-4" />}
          active={!!current.dueDate}
        >
          <DueDateField current={current} onPatch={patch} />
        </IconPopover>

        <IconPopover
          label={t('task:project')}
          icon={<Folder className="h-4 w-4" />}
          active={!!current.projectId}
        >
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            <button
              type="button"
              onClick={() => patch({ projectId: null })}
              className={cn(
                'rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                !current.projectId && 'font-medium text-primary',
              )}
            >
              {t('common:none')}
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => p.id !== current.projectId && patch({ projectId: p.id })}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                  p.id === current.projectId && 'font-medium text-primary',
                )}
              >
                <Check
                  className={cn(
                    'h-3.5 w-3.5',
                    p.id === current.projectId ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {p.title}
              </button>
            ))}
          </div>
        </IconPopover>

        <IconPopover
          label={t('task:area')}
          icon={<Target className="h-4 w-4" />}
          active={!!current.areaId}
        >
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            <button
              type="button"
              onClick={() => patch({ areaId: null })}
              className={cn(
                'rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                !current.areaId && 'font-medium text-primary',
              )}
            >
              {t('common:none')}
            </button>
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => a.id !== current.areaId && patch({ areaId: a.id })}
                className={cn(
                  'flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                  a.id === current.areaId && 'font-medium text-primary',
                )}
              >
                <Check
                  className={cn(
                    'h-3.5 w-3.5',
                    a.id === current.areaId ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {a.title}
              </button>
            ))}
          </div>
        </IconPopover>

        <IconPopover
          label={t('task:tags')}
          icon={<Tag className="h-4 w-4" />}
          active={(current.tags ?? []).length > 0}
        >
          <TagsField current={current} onPatch={patch} />
        </IconPopover>

        {subtasks.length === 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label={t('task:addSubtask')}
            onClick={(e) => {
              e.stopPropagation();
              openSubtasks();
            }}
          >
            <ListPlus className="h-4 w-4" />
          </Button>
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
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', active ? 'text-primary' : 'text-muted-foreground')}
          aria-label={label}
        >
          {icon}
        </Button>
      </PopoverTrigger>
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
  const completeSubtask = useCompleteSubtask();
  const uncompleteSubtask = useUncompleteSubtask();
  const deleteSubtask = useDeleteSubtask();
  const updateSubtask = useUpdateSubtask();
  const completed = subtask.status === 'COMPLETED';
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(subtask.title);

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
    <li className="flex items-center gap-2 text-sm">
      <TaskCheckbox
        checked={completed}
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
          className="h-8 flex-1 border-0 px-0 text-sm font-normal shadow-none focus-visible:ring-0"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(subtask.title);
            setEditing(true);
          }}
          className={cn('flex-1 text-left', completed && 'text-muted-foreground line-through')}
        >
          {subtask.title}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label={t('common:delete')}
        onClick={(e) => {
          e.stopPropagation();
          deleteSubtask.mutate(
            { id: subtask.id, taskId },
            { onSuccess: onMutated },
          );
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}