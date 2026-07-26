import * as React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useProjectsQuery, useDeleteProject, useUpdateProject } from '@/lib/hooks/useProjects';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { TaskListView } from '@/components/task/TaskListView';
import { ProjectForm } from '@/components/project/ProjectForm';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { toast } from 'sonner';

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const autoEdit = (location.state as { editTitle?: boolean } | null)?.editTitle === true;
  const { data: projects = [] } = useProjectsQuery();
  const project = projects.find((p) => p.id === id);
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ projectId: id });
  const [editOpen, setEditOpen] = React.useState(false);
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();

  const handleDelete = () => {
    if (!project) return;
    if (!window.confirm(t('project:deleteConfirm', { name: project.title }))) return;
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        toast.success(t('project:deleted'));
        navigate('/projects');
      },
      onError: () => toast.error(t('common:deleteFailed')),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/projects')}
            className="mb-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('common:backTo', { label: t('nav:projects') })}
          </button>
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
        <Button variant="ghost" onClick={() => setEditOpen(true)}>
          {t('common:edit')}
        </Button>
        <Button variant="ghost" className="text-[#CC4444]" onClick={handleDelete}>
          {t('common:delete')}
        </Button>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint={t('project:noTasks')} />
      )}
      {project && <ProjectForm open={editOpen} onOpenChange={setEditOpen} project={project} />}
    </div>
  );
}