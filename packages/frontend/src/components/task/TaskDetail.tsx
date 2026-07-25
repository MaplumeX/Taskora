import * as React from 'react';
import { Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useTagsQuery } from '@/lib/hooks/useTags';
import {
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useTaskQuery,
  useUncompleteTask,
  useUpdateTask,
} from '@/lib/hooks/useTasks';
import { taskKeys } from '@/lib/hooks/useTasks';
import { toInputDateValue, fromInputDateValue } from '@/lib/utils/date';
import { toast } from 'sonner';

interface Props {
  task: TaskResponseDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetail({ task, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogTitle className="sr-only">任务详情</DialogTitle>
        {task && <TaskDetailBody key={task.id} task={task} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailBody({ task, onClose }: { task: TaskResponseDto; onClose: () => void }) {
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

  const dateValue = current.dueDate ? toInputDateValue(new Date(current.dueDate)) : '';

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
  const onDateChange = (value: string) => {
    if (value) patch({ dueDate: fromInputDateValue(value).toISOString() });
    else patch({ dueDate: null });
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
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => (completed ? uncompleteTask : completeTask).mutate(task.id, { onSuccess: invalidateParent })}>
          {completed ? '取消完成' : '标记完成'}
        </Button>
        <Button
          variant="ghost"
          className="ml-auto text-[#CC4444]"
          onClick={() => {
            deleteTask.mutate(task.id, { onSuccess: onClose });
          }}
        >
          <Trash2 className="h-4 w-4" /> 移到废纸篓
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="border-0 px-0 py-0 text-lg font-medium shadow-none focus-visible:ring-0"
      />

      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={commitNotes}
        placeholder="备注…"
        className="min-h-[80px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
      />

      <div className="grid grid-cols-[80px_1fr] items-center gap-3 text-sm">
        <span className="text-muted-foreground">日期</span>
        <input
          type="date"
          value={dateValue}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-fit rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-muted-foreground">项目</span>
        <select
          value={current.projectId ?? ''}
          onChange={(e) => patch({ projectId: e.target.value || null })}
          className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">无</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">区域</span>
        <select
          value={current.areaId ?? ''}
          onChange={(e) => patch({ areaId: e.target.value || null })}
          className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">无</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground">标签</span>
        <div className="flex flex-wrap gap-1">
          {tags.length === 0 ? (
            <span className="py-1 text-xs text-muted-foreground/60">暂无标签，请先在 Tags 页创建</span>
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
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-opacity ${
                    selected ? 'opacity-100' : 'opacity-40'
                  }`}
                  style={
                    selected
                      ? { backgroundColor: tag.color, color: '#fff' }
                      : { color: tag.color }
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.title}
                </button>
              );
            })
          )}
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">子任务</h3>
        {children.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {children.map((c) => (
              <SubtaskRow key={c.id} task={c} onMutated={invalidateParent} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">暂无子任务</p>
        )}
        <Input
          value={subtaskTitle}
          onChange={(e) => setSubtaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
          placeholder="添加子任务…"
          className="mt-1"
        />
      </div>
    </div>
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
  const completed = task.status === 'COMPLETED';
  return (
    <li className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={completed}
        onChange={() =>
          (completed ? uncompleteTask : completeTask).mutate(task.id, { onSuccess: onMutated })
        }
      />
      <span className={completed ? 'text-muted-foreground line-through' : ''}>{task.title}</span>
      <button
        className="ml-auto text-muted-foreground hover:text-[#CC4444]"
        onClick={() => deleteTask.mutate(task.id, { onSuccess: onMutated })}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}