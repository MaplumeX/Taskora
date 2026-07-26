import * as React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { ProjectResponseDto } from '@taskora/shared';

import { useAreasQuery, useUpdateArea } from '@/lib/hooks/useAreas';
import { useProjectsQuery, useReorderProjects } from '@/lib/hooks/useProjects';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { Separator } from '@/components/ui/separator';
import { ProjectItem } from '@/components/project/ProjectItem';
import { TaskListView } from '@/components/task/TaskListView';
import { InlineTitleEdit } from '@/components/common/InlineTitleEdit';
import { toast } from 'sonner';

function SortableProjectItem({ project }: { project: ProjectResponseDto }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <ProjectItem project={project} />
    </div>
  );
}

export default function AreaDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const autoEdit = (location.state as { editTitle?: boolean } | null)?.editTitle === true;
  const { data: areas = [] } = useAreasQuery();
  const area = areas.find((a) => a.id === id);
  const { data: allProjects = [] } = useProjectsQuery();
  const projects = allProjects.filter((p) => p.areaId === id);
  const reorderProjects = useReorderProjects();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ areaId: id });
  const updateArea = useUpdateArea();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleProjectDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const reordered = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    reorderProjects.mutate(reordered);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          {area ? (
            <InlineTitleEdit
              value={area.title}
              placeholder={t('area:newItemPlaceholder')}
              autoFocusAndSelect={autoEdit}
              onSubmit={(next) => {
                if (!area) return;
                updateArea.mutate(
                  { id: area.id, data: { title: next } },
                  {
                    onError: () => toast.error(t('common:saveFailed')),
                  },
                );
              }}
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{t('area:defaultTitle')}</h1>
          )}
        </div>
        </div>

      <h2 className="text-sm font-medium text-muted-foreground">{t('area:projectsLabel')}</h2>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('area:noProjects')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProjectDragEnd}>
          <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {projects.map((p) => (
                <SortableProjectItem key={p.id} project={p} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

      </div>
  );
}