import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { ProjectResponseDto } from '@taskora/shared';

import { ProjectItem } from '@/components/project/ProjectItem';
import { projectDndId } from '@/components/layout/sidebarProjectLayout';

interface Props {
  project: ProjectResponseDto;
  placeholder?: boolean;
  projectDragActive?: boolean;
}

/**
 * 侧边栏可拖拽项目条目包装。
 *
 * - sortable id 采用 `proj:<projectId>` 前缀，与区域条目 (`area:<id>`) 区分。
 * - listeners 挂在外层 div 而非 ProjectItem 的 button 上，配合 PointerSensor
 *   distance:5 激活距离，保留点击导航行为。
 */
export function SortableProjectItem({
  project,
  placeholder = false,
  projectDragActive = false,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: projectDndId(project.id) });

  return (
    <div
      ref={setNodeRef}
      data-sortable-project-id={project.id}
      style={{
        transform: projectDragActive ? undefined : CSS.Translate.toString(transform),
        transition: projectDragActive ? undefined : transition,
        opacity: isDragging && !projectDragActive ? 0.5 : undefined,
        zIndex: isDragging && !projectDragActive ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {placeholder ? (
        <div
          data-testid={`project-placeholder-${project.id}`}
          className="relative h-8"
          aria-hidden="true"
        >
          <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary" />
        </div>
      ) : (
        <ProjectItem project={project} showChevron={false} />
      )}
    </div>
  );
}
