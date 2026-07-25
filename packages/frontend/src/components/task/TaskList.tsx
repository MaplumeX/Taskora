import type { TaskResponseDto } from '@taskora/shared';

import { TaskItem } from './TaskItem';
import type { SelectionState } from '@/lib/hooks/useTaskRowSelection';

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
  selectedId?: string | null;
  expandedId?: string | null;
  onRowClick?: (id: string) => void;
  onToggleComplete: (task: TaskResponseDto) => void;
  onTrash: (task: TaskResponseDto) => void;
  emptyHint?: string;
}

export function TaskList({
  tasks,
  projects = {},
  areas = {},
  selectedId,
  expandedId,
  onRowClick,
  onToggleComplete,
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
      {topTasks.map((task) => {
        const selectionState: SelectionState =
          expandedId === task.id ? 'expanded' : selectedId === task.id ? 'selected' : 'idle';
        return (
          <TaskItem
            key={task.id}
            task={task}
            projectTitle={task.projectId ? projects[task.projectId] : undefined}
            areaTitle={task.areaId ? areas[task.areaId] : undefined}
            selectionState={selectionState}
            onToggleComplete={() => onToggleComplete(task)}
            onRowClick={onRowClick ? () => onRowClick(task.id) : undefined}
            onTrash={() => onTrash(task)}
          />
        );
      })}
    </div>
  );
}