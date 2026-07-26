import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useProjectsQuery, useUpdateProject } from '@/lib/hooks/useProjects';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { TaskListView } from '@/components/task/TaskListView';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const autoEdit = (location.state as { editTitle?: boolean } | null)?.editTitle === true;
  const { data: projects = [] } = useProjectsQuery();
  const project = projects.find((p) => p.id === id);
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ projectId: id });
  const updateProject = useUpdateProject();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          {project ? (
            <InlineTitleEdit
              value={project.title}
              placeholder={t('project:newItemPlaceholder')}
              autoFocusAndSelect={autoEdit}
              onSubmit={(next) => {
                if (!project) return;
                updateProject.mutate(
                  { id: project.id, data: { title: next } },
                  {
                    onError: () => toast.error(t('common:saveFailed')),
                  },
                );
              }}
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{t('project:defaultTitle')}</h1>
          )}
        </div>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint={t('project:noTasks')} />
      )}
    </div>
  );
}