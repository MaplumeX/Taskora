import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from './TaskItem';

interface ProjectLookup {
  [projectId: string]: string;
}
interface AreaLookup {
  [areaId: string]: string;
}

interface Props {
  tasks: TaskResponseDto[];
  projects?: ProjectLookup;
  areas?: AreaLookup;
  onToggleComplete: (task: TaskResponseDto) => void;
  onOpenDetail: (task: TaskResponseDto) => void;
  onTrash: (task: TaskResponseDto) => void;
  emptyHint?: string;
}

export function TaskList({
  tasks,
  projects = {},
  areas = {},
  onToggleComplete,
  onOpenDetail,
  onTrash,
  emptyHint = '没有任务',
}: Props) {
  const topTasks = tasks.filter((t) => !t.parentId);
  if (topTasks.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <span className="text-3xl">🎉</span>
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {topTasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          projectTitle={task.projectId ? projects[task.projectId] : undefined}
          areaTitle={task.areaId ? areas[task.areaId] : undefined}
          onToggleComplete={() => onToggleComplete(task)}
          onOpenDetail={() => onOpenDetail(task)}
          onTrash={() => onTrash(task)}
        />
      ))}
    </div>
  );
}