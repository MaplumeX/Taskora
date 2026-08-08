import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useCompleteProject, useProjectsQuery, useUncompleteProject, useUpdateProject } from '@/lib/hooks/useProjects';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { useProjectHeadingsQuery } from '@/lib/hooks/useProjectHeadings';
import { ProjectTaskLayout } from '@/components/project/ProjectTaskLayout';
import { ProjectCompletedTasks } from '@/components/project/ProjectCompletedTasks';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { ProjectMoreMenu } from '@/components/project/ProjectContextMenu';
import { Textarea } from '@/components/ui/textarea';
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
  const updateProject = useUpdateProject();
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();

  const [notes, setNotes] = useState(project?.notes ?? '');
  useEffect(() => setNotes(project?.notes ?? ''), [project?.notes]);

  const commitNotes = () => {
    if (!project) return;
    if (notes !== (project.notes ?? '')) {
      updateProject.mutate(
        { id: project.id, data: { notes } },
        { onError: () => toast.error(t('common:saveFailed')) },
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {project ? (
            <ProjectProgressRing
              total={project.taskTotalCount}
              completed={project.taskCompletedCount}
              projectStatus={project.status}
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

      {project ? (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          placeholder={t('project:notePlaceholder')}
          className="min-h-[60px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
        />
      ) : null}

      {isLoading || headingsLoading ? null : isError || headingsError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : (
        <ProjectTaskLayout
          projectId={id ?? ''}
          tasks={tasks}
          headings={headings}
          emptyHint={t('project:noTasks')}
        />
      )}

      <ProjectCompletedTasks projectId={id ?? ''} />
    </div>
  );
}
