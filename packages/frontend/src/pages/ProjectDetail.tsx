import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useCompleteProject, useProjectsQuery, useUncompleteProject, useUpdateProject } from '@/lib/hooks/useProjects';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useProjectHeadingsQuery } from '@/lib/hooks/useProjectHeadings';
import { useDelayedLoading } from '@/lib/hooks/useDelayedLoading';
import { ProjectTaskLayout } from '@/components/project/ProjectTaskLayout';
import { TaskListSkeleton } from '@/components/task/TaskListSkeleton';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { TaskCheckbox } from '@/components/task/TaskCheckbox';
import { ProjectMoreMenu } from '@/components/project/ProjectContextMenu';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const pendingAutoEditId = useUiInteractionStore((s) => s.pendingAutoEditId);
  const clearPendingAutoEditId = useUiInteractionStore((s) => s.clearPendingAutoEditId);
  const autoEdit = pendingAutoEditId === id;
  useEffect(() => {
    if (autoEdit) clearPendingAutoEditId();
  }, [autoEdit, clearPendingAutoEditId]);
  const { data: projects = [] } = useProjectsQuery();
  const project = projects.find((p) => p.id === id);
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ projectId: id });
  const {
    data: headings = [],
    isLoading: headingsLoading,
    isError: headingsError,
  } = useProjectHeadingsQuery(id);
  const showSkeleton = useDelayedLoading(isLoading || headingsLoading);
  const updateProject = useUpdateProject();
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {project ? (
            <TaskCheckbox
              checked={project.status === 'COMPLETED'}
              onToggle={() => {
                if (!project) return;
                const completed = project.status === 'COMPLETED';
                (completed ? uncompleteProject : completeProject).mutate(project.id, {
                  onError: () => toast.error(t('common:saveFailed')),
                });
              }}
            />
          ) : null}
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
            <h1 className="text-xl font-semibold tracking-tight">{t('project:defaultTitle')}</h1>
          )}
        </div>
        {project && <ProjectMoreMenu project={project} current={project} />}
      </div>

      {showSkeleton ? (
        <TaskListSkeleton />
      ) : isError || headingsError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <ProjectTaskLayout
          projectId={id ?? ''}
          tasks={tasks}
          headings={headings}
          emptyHint={t('project:noTasks')}
        />
      )}
    </div>
  );
}
