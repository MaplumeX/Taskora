import { useTranslation } from 'react-i18next';

import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { TaskContextMenu } from '@/components/task/TaskContextMenu';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';

export default function Trash() {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'trash' });
  const showSkeleton = useDelayedLoading(isLoading);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('nav:trash')}</h1>
      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('task:trashEmpty')}</p>
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <TaskContextMenu key={task.id} task={task} current={task} variant="trash">
              <div className="flex h-12 items-center gap-3 px-2 text-sm text-muted-foreground">
                <TaskCheckbox checked={false} onToggle={() => {}} disabled />
                <span className="flex-1 truncate line-through">{task.title}</span>
                <TaskDateBadge scheduledDate={task.scheduledDate} />
              </div>
            </TaskContextMenu>
          ))}
        </div>
      )}
    </div>
  );
}