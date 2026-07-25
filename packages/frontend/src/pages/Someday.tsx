import { useTasksQuery } from '@/lib/hooks/useTasks';
import { TaskListView } from '@/components/task/TaskListView';

export default function Someday() {
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'someday' });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Someday</h1>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint="没有 Someday 任务" />
      )}
    </div>
  );
}