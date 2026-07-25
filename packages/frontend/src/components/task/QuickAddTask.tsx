import * as React from 'react';
import { Plus } from 'lucide-react';

import type { CreateTaskDto, TaskBucket } from '@taskora/shared';

import { Input } from '@/components/ui/input';
import { useCreateTask } from '@/lib/hooks/useTasks';
import { toast } from 'sonner';

interface Props {
  /** Default bucket for created tasks */
  defaultBucket?: TaskBucket;
  /** Set scheduledDate to today on creation (Today view) */
  dueToday?: boolean;
  /** Parent task id for subtasks */
  parentId?: string;
  /** Assign new task to this project */
  projectId?: string;
  /** Assign new task to this area */
  areaId?: string;
  placeholder?: string;
}

export function QuickAddTask({
  defaultBucket,
  dueToday,
  parentId,
  projectId,
  areaId,
  placeholder = '添加任务…',
}: Props) {
  const [title, setTitle] = React.useState('');
  const createTask = useCreateTask();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const payload: CreateTaskDto = { title: trimmed };
    if (defaultBucket) payload.bucket = defaultBucket;
    if (parentId) payload.parentId = parentId;
    if (projectId) payload.projectId = projectId;
    if (areaId) payload.areaId = areaId;
    if (dueToday) {
      payload.scheduledDate = new Date().toISOString();
    }
    createTask.mutate(payload, {
      onSuccess: () => setTitle(''),
      onError: () => toast.error('创建失败'),
    });
  };

  return (
    <div className="flex items-center gap-2 border-b pb-3">
      <Plus className="h-4 w-4 text-muted-foreground" />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setTitle('');
        }}
        placeholder={placeholder}
        className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
        disabled={createTask.isPending}
      />
    </div>
  );
}