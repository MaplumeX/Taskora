import * as React from 'react';
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

import { useProjectsQuery, useReorderProjects } from '@/lib/hooks/useProjects';
import { ProjectItem } from '@/components/project/ProjectItem';
import { ProjectForm } from '@/components/project/ProjectForm';
import { Button } from '@/components/ui/button';

interface SortableProjectItemProps {
  project: ProjectResponseDto;
}

function SortableProjectItem({ project }: SortableProjectItemProps) {
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

export default function Projects() {
  const { t } = useTranslation();
  const { data: projects = [], isLoading } = useProjectsQuery();
  const reorderProjects = useReorderProjects();
  const [open, setOpen] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = projects.map((p) => p.id);
    const reordered = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    reorderProjects.mutate(reordered);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{t('nav:projects')}</h1>
        <Button onClick={() => setOpen(true)}>{t('project:create')}</Button>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : projects.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('project:empty')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {projects.map((p) => (
                <SortableProjectItem key={p.id} project={p} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <ProjectForm open={open} onOpenChange={setOpen} />
    </div>
  );
}