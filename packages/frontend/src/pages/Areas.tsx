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

import type { AreaResponseDto } from '@taskora/shared';

import { useAreasQuery, useReorderAreas } from '@/lib/hooks/useAreas';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { AreaItem } from '@/components/area/AreaItem';
import { AreaForm } from '@/components/area/AreaForm';
import { Button } from '@/components/ui/button';

interface SortableAreaItemProps {
  area: AreaResponseDto;
  projectCount: number;
}

function SortableAreaItem({ area, projectCount }: SortableAreaItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: area.id });

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
      <AreaItem area={area} projectCount={projectCount} />
    </div>
  );
}

export default function Areas() {
  const { t } = useTranslation();
  const { data: areas = [], isLoading } = useAreasQuery();
  const { data: projects = [] } = useProjectsQuery();
  const reorderAreas = useReorderAreas();
  const [open, setOpen] = React.useState(false);

  const projectCount = (areaId: string) =>
    projects.filter((p) => p.areaId === areaId).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = areas.map((a) => a.id);
    const reordered = arrayMove(ids, ids.indexOf(active.id as string), ids.indexOf(over.id as string));
    reorderAreas.mutate(reordered);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav:areas')}</h1>
        <Button onClick={() => setOpen(true)}>{t('area:create')}</Button>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : areas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('area:empty')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={areas.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {areas.map((a) => (
                <SortableAreaItem key={a.id} area={a} projectCount={projectCount(a.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <AreaForm open={open} onOpenChange={setOpen} />
    </div>
  );
}