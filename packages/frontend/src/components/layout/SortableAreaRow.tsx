import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { SidebarAreaRow } from '@/components/layout/SidebarAreaRow';

interface Props {
  area: AreaResponseDto;
  projects: ProjectResponseDto[];
}

const AREA_PREFIX = 'area:';

/**
 * 侧边栏可拖拽区域条目包装。
 *
 * - sortable id 采用 `area:<areaId>` 前缀。
 * - listeners 挂在外层 div 上，保留 SidebarAreaRow 内 NavLink 导航与 chevron 折叠行为。
 */
export function SortableAreaRow({ area, projects }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `${AREA_PREFIX}${area.id}` });

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
      <SidebarAreaRow area={area} projects={projects} />
    </div>
  );
}
