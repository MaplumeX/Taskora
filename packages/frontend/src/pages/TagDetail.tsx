import { useNavigate, useParams } from 'react-router-dom';

import { useTagsQuery } from '@/lib/hooks/useTags';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { TaskListView } from '@/components/task/TaskListView';

export default function TagDetail() {
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  const { data: tags = [] } = useTagsQuery();
  const tag = tags.find((t) => t.id === tagId);

  const { data: tasks = [], isLoading, isError } = useTasksQuery({ tagId });

  const topLevel = tasks.filter((t) => !t.parentId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          onClick={() => navigate('/tags')}
          className="mb-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ‹ 返回 Tags
        </button>
        <div className="flex items-center gap-2">
          {tag && (
            <span
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          <h1 className="text-2xl font-semibold tracking-tight">
            {tag?.title ?? '标签'}
          </h1>
        </div>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : (
        <TaskListView tasks={topLevel} emptyHint="该标签下没有任务" />
      )}
    </div>
  );
}