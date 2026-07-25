import * as React from 'react';
import {
  Calendar,
  Check,
  Folder,
  Tag,
  Target,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';
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
import { useTagsQuery } from '@/lib/hooks/useTags';
import {
  taskKeys,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useTaskQuery,
  useUncompleteTask,
  useUpdateTask,
} from '@/lib/hooks/useTasks';
import { toInputDateValue, fromInputDateValue } from '@/lib/utils/date';
import { toast } from 'sonner';

interface Props {
  task: TaskResponseDto;
}

export function TaskRowExpanded({ task }: Props) {
  const queryClient = useQueryClient();
  const { data: liveTask } = useTaskQuery(task.id);
  const current = liveTask ?? task;

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const createSubtask = useCreateTask();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { data: tags = [] } = useTagsQuery();

  const [title, setTitle] = React.useState(current.title);
  const [notes, setNotes] = React.useState(current.notes ?? '');
  const [subtaskTitle, setSubtaskTitle] = React.useState('');
  const completed = current.status === 'COMPLETED';

  const scheduledType = current.scheduledType ?? ScheduledType.NONE;
  const dateValue = current.scheduledDate
    ? toInputDateValue(new Date(current.scheduledDate))
    : '';

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
        onError: () => toast.error('保存失败'),
      },
    );

  const commitTitle = () => {
    if (title.trim() && title !== current.title) patch({ title: title.trim() });
  };
  const commitNotes = () => {
    if (notes !== (current.notes ?? '')) patch({ notes });
  };

  const onScheduledTypeChange = (type: ScheduledType) =>
    patch({ scheduledType: type });

  const onDateChange = (value: string) => {
    if (value)
      patch({
        scheduledType: ScheduledType.DATE,
        scheduledDate: fromInputDateValue(value).toISOString(),
      });
    else patch({ scheduledType: ScheduledType.NONE });
  };

  const addSubtask = () => {
    const t = subtaskTitle.trim();
    if (!t) return;
    createSubtask.mutate(
      {
        title: t,
        parentId: task.id,
        projectId: current.projectId ?? undefined,
        areaId: current.areaId ?? undefined,
      },
      {
        onSuccess: () => {
          setSubtaskTitle('');
          invalidateParent();
        },
        onError: () => toast.error('子任务创建失败'),
      },
    );
  };

  const children = current.children ?? [];

  return (
    <div
      className="flex flex-col gap-3 px-2 pb-3 pt-1"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            (completed ? uncompleteTask : completeTask).mutate(task.id, {
              onSuccess: invalidateParent,
            })
          }
        >
          {completed ? '取消完成' : '标记完成'}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <IconPopover
            label="日期"
            icon={<Calendar className="h-4 w-4" />}
            active={scheduledType !== ScheduledType.NONE}
          >
            <div className="flex flex-col gap-2">
              <div className="flex gap-1">
                {[ScheduledType.NONE, ScheduledType.DATE, ScheduledType.SOMEDAY].map(
                  (type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onScheduledTypeChange(type)}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs transition-colors',
                        scheduledType === type
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-input text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {type === ScheduledType.NONE
                        ? '无'
                        : type === ScheduledType.DATE
                        ? '日期'
                        : 'Someday'}
                    </button>
                  ),
                )}
              </div>
              {scheduledType === ScheduledType.DATE && (
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => onDateChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </div>
          </IconPopover>

          <IconPopover
            label="项目"
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
                无
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
            label="区域"
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
                无
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
            label="标签"
            icon={<Tag className="h-4 w-4" />}
            active={(current.tags ?? []).length > 0}
          >
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {tags.length === 0 ? (
                <span className="px-2 py-1.5 text-xs text-muted-foreground/60">
                  暂无标签，请先在 Tags 页创建
                </span>
              ) : (
                tags.map((tag) => {
                  const selected = (current.tags ?? []).some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        const currentIds = (current.tags ?? []).map((t) => t.id);
                        const next = selected
                          ? currentIds.filter((id) => id !== tag.id)
                          : [...currentIds, tag.id];
                        patch({ tagIds: next });
                      }}
                      className={cn(
                        'flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                        selected ? 'opacity-100' : 'opacity-50',
                      )}
                      style={{ color: tag.color }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.title}
                      {selected && <Check className="ml-auto h-3.5 w-3.5" />}
                    </button>
                  );
                })
              )}
            </div>
          </IconPopover>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#CC4444]"
            aria-label="移到废纸篓"
            onClick={() => deleteTask.mutate(task.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onClick={(e) => e.stopPropagation()}
        className="border-0 px-0 py-0 text-base font-medium shadow-none focus-visible:ring-0"
      />

      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={commitNotes}
        placeholder="备注…"
        className="min-h-[60px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
      />

      <Separator />

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">子任务</h3>
        {children.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {children.map((c) => (
              <SubtaskRow key={c.id} task={c} onMutated={invalidateParent} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">暂无子任务</p>
        )}
        <Input
          value={subtaskTitle}
          onChange={(e) => setSubtaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
          onClick={(e) => e.stopPropagation()}
          placeholder="添加子任务…"
          className="mt-1 h-8 text-sm"
        />
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
  children: React.ReactNode;
}) {
  return (
    <Popover>
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
      <PopoverContent align="start">{children}</PopoverContent>
    </Popover>
  );
}

function SubtaskRow({
  task,
  onMutated,
}: {
  task: TaskResponseDto;
  onMutated: () => void;
}) {
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const completed = task.status === 'COMPLETED';
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(task.title);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== task.title) {
      updateTask.mutate(
        { id: task.id, data: { title: t } },
        { onSuccess: onMutated, onError: () => toast.error('保存失败') },
      );
    } else {
      setDraft(task.title);
    }
    setEditing(false);
  };

  return (
    <li className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={completed}
        onClick={(e) => e.stopPropagation()}
        onChange={() =>
          (completed ? uncompleteTask : completeTask).mutate(task.id, {
            onSuccess: onMutated,
          })
        }
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(task.title);
              setEditing(false);
            }
          }}
          className="flex-1 rounded-sm bg-transparent px-1 outline-none ring-1 ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(task.title);
            setEditing(true);
          }}
          className={cn('flex-1 text-left', completed && 'text-muted-foreground line-through')}
        >
          {task.title}
        </button>
      )}
      <button
        className="ml-auto text-muted-foreground hover:text-[#CC4444]"
        onClick={(e) => {
          e.stopPropagation();
          deleteTask.mutate(task.id, { onSuccess: onMutated });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}