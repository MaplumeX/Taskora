import * as React from 'react';
import { RotateCcw } from 'lucide-react';

import type { TaskResponseDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { useTasksQuery, useRestoreTask } from '@/lib/hooks/useTasks';
import { toast } from 'sonner';

export default function Trash() {
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'trash' });
  const restoreTask = useRestoreTask();

  const handleRestore = (task: TaskResponseDto) => {
    restoreTask.mutate(task.id, {
      onSuccess: () => toast.success('已恢复'),
      onError: () => toast.error('恢复失败'),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">废纸篓是空的</p>
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex h-12 items-center gap-3 px-2 text-sm text-muted-foreground"
            >
              <TaskCheckbox checked={false} onToggle={() => {}} disabled />
              <span className="flex-1 truncate line-through">{task.title}</span>
              <TaskDateBadge scheduledDate={task.scheduledDate} />
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => handleRestore(task)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> 恢复
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}