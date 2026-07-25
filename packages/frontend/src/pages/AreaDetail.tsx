import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAreasQuery, useDeleteArea } from '@/lib/hooks/useAreas';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AreaForm } from '@/components/area/AreaForm';
import { ProjectItem } from '@/components/project/ProjectItem';
import { TaskListView } from '@/components/task/TaskListView';
import { toast } from 'sonner';

export default function AreaDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: areas = [] } = useAreasQuery();
  const area = areas.find((a) => a.id === id);
  const { data: allProjects = [] } = useProjectsQuery();
  const projects = allProjects.filter((p) => p.areaId === id);
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ areaId: id });
  const [editOpen, setEditOpen] = React.useState(false);
  const deleteArea = useDeleteArea();

  const handleDelete = () => {
    if (!area) return;
    if (!window.confirm(t('area:deleteConfirm', { name: area.title }))) return;
    deleteArea.mutate(area.id, {
      onSuccess: () => {
        toast.success(t('area:deleted'));
        navigate('/areas');
      },
      onError: () => toast.error(t('area:deleteFailedHint')),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/areas')}
            className="mb-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('common:backTo', { label: t('nav:areas') })}
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{area?.title ?? t('area:defaultTitle')}</h1>
        </div>
        <Button variant="ghost" onClick={() => setEditOpen(true)}>
          {t('common:edit')}
        </Button>
        <Button variant="ghost" className="text-[#CC4444]" onClick={handleDelete}>
          {t('common:delete')}
        </Button>
      </div>

      <h2 className="text-sm font-medium text-muted-foreground">{t('area:projectsLabel')}</h2>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('area:noProjects')}</p>
      ) : (
        <div className="flex flex-col">
          {projects.map((p) => (
            <ProjectItem key={p.id} project={p} />
          ))}
        </div>
      )}

      <Separator />

      <h2 className="text-sm font-medium text-muted-foreground">{t('area:tasksLabel')}</h2>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">{t('common:loadFailed')}</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint={t('area:noTasks')} />
      )}

      {area && <AreaForm open={editOpen} onOpenChange={setEditOpen} area={area} />}
    </div>
  );
}