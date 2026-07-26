import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useTagsQuery } from '@/lib/hooks/useTags';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import { TaskListView } from '@/components/task/TaskListView';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';

export default function TagDetail() {
  const { t } = useTranslation();
  const { tagId } = useParams<{ tagId: string }>();
  const navigate = useNavigate();
  const { data: tags = [] } = useTagsQuery();
  const tag = tags.find((t) => t.id === tagId);

  const { data: tasks = [], isLoading, isError } = useTasksQuery({ tagId });
  const showSkeleton = useDelayedLoading(isLoading);

  const topLevel = tasks.filter((t) => !t.parentId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          onClick={() => navigate('/tags')}
          className="mb-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {t('common:backTo', { label: t('nav:tags') })}
        </button>
        <div className="flex items-center gap-2">
          {tag && (
            <span
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          <h1 className="text-xl font-semibold tracking-tight">
            {tag?.title ?? t('tag:defaultTitle')}
          </h1>
        </div>
      </div>

      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={topLevel} emptyHint={t('tag:noTasks')} />
      )}
    </div>
  );
}