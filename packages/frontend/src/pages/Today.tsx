import { useTasksQuery } from '@/lib/hooks/useTasks';
import { QuickAddTask } from '@/components/task/QuickAddTask';
import { TaskListView } from '@/components/task/TaskListView';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Today() {
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ view: 'today' });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <p className="text-sm text-muted-foreground">{todayISO()}</p>
      <QuickAddTask dueToday placeholder="添加今天要做的任务…" />
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint="今天没有任务" />
      )}
    </div>
  );
}