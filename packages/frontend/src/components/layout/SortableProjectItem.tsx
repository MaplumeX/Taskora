import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { ProjectResponseDto } from '@taskora/shared';

import { ProjectItem } from '@/components/project/ProjectItem';

interface Props {
  project: ProjectResponseDto;
}

const PROJ_PREFIX = 'proj:';

/**
 * 侧边栏可拖拽项目条目包装。
 *
 * - sortable id 采用 `proj:<projectId>` 前缀，与区域条目 (`area:<id>`) 区分。
 * - listeners 挂在外层 div 而非 ProjectItem 的 button 上，配合 PointerSensor
 *   distance:5 激活距离，保留点击导航行为。
 */
export function SortableProjectItem({ project }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `${PROJ_PREFIX}${project.id}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <ProjectItem project={project} showChevron={false} />
    </div>
  );
}
