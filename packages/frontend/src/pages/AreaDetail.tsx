import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

import { useAreasQuery, useDeleteArea } from '@/lib/hooks/useAreas';
import { useProjectsQuery, useReorderProjects } from '@/lib/hooks/useProjects';
import { useTasksQuery } from '@/lib/hooks/useTasks';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AreaForm } from '@/components/area/AreaForm';
import { ProjectItem } from '@/components/project/ProjectItem';
import { TaskListView } from '@/components/task/TaskListView';
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: areas = [] } = useAreasQuery();
  const area = areas.find((a) => a.id === id);
  const { data: allProjects = [] } = useProjectsQuery();
  const projects = allProjects.filter((p) => p.areaId === id);
  const reorderProjects = useReorderProjects();
  const { data: tasks = [], isLoading, isError } = useTasksQuery({ areaId: id });
  const [editOpen, setEditOpen] = React.useState(false);
  const deleteArea = useDeleteArea();

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

  const handleDelete = () => {
    if (!area) return;
    if (!window.confirm(`确认删除区域「${area.title}」？区域内的项目不会被删除。`)) return;
    deleteArea.mutate(area.id, {
      onSuccess: () => {
        toast.success('区域已删除');
        navigate('/areas');
      },
      onError: () => toast.error('删除失败（请先移除区域内的项目）'),
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
            ‹ 返回 Areas
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">{area?.title ?? '区域'}</h1>
        </div>
        <Button variant="ghost" onClick={() => setEditOpen(true)}>
          编辑
        </Button>
        <Button variant="ghost" className="text-[#CC4444]" onClick={handleDelete}>
          删除
        </Button>
      </div>

      <h2 className="text-sm font-medium text-muted-foreground">项目</h2>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">该区域下没有项目</p>
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

      <h2 className="text-sm font-medium text-muted-foreground">任务</h2>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#CC4444]">加载失败</p>
      ) : (
        <TaskListView tasks={tasks} emptyHint="该区域下没有任务" />
      )}

      {area && <AreaForm open={editOpen} onOpenChange={setEditOpen} area={area} />}
    </div>
  );
}