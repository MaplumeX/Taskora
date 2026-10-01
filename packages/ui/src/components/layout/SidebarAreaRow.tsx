import * as React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { sidebarRowClass } from '@/components/layout/sidebarRowClass';
import { SortableProjectItem } from '@/components/layout/SortableProjectItem';
import {
  projectContainerDndId,
  projectDndId,
} from '@/components/layout/sidebarProjectLayout';

interface Props {
  area: AreaResponseDto;
  projects: ProjectResponseDto[];
  activeProjectId: string | null;
  projectDragActive: boolean;
}

/**
 * 侧边栏合并后的区域条目。主体点击进入区域详情；右侧 chevron 仅切换展开/收起。
 * 展开的项目列表和区域标题都可作为项目放置目标。
 */
export function SidebarAreaRow({
  area,
  projects,
  activeProjectId,
  projectDragActive,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(true);
  const { setNodeRef: setProjectContainerRef } = useDroppable({
    id: projectContainerDndId(area.id),
  });
  const label = area.title || t('area:newItemPlaceholder');
  const collapsedPlaceholder =
    !open && activeProjectId !== null && projects[0]?.id === activeProjectId;

  const renderProject = (project: ProjectResponseDto) => (
    <SortableProjectItem
      key={project.id}
      project={project}
      placeholder={project.id === activeProjectId}
      projectDragActive={projectDragActive}
    />
  );

  return (
    <div className="mt-2 flex flex-col gap-px">
      <div className="group/area relative flex items-center">
        <NavLink
          to={`/areas/${area.id}`}
          className={({ isActive }) =>
            sidebarRowClass(isActive, 'flex-1 font-semibold')
          }
        >
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              'flex-1 truncate',
              !area.title && 'text-muted-foreground',
            )}
          >
            {label}
          </span>
        </NavLink>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((value) => !value);
          }}
          aria-label={
            open ? t('nav:collapse', { label }) : t('nav:expand', { label })
          }
          className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent focus-visible:opacity-100 group-hover/area:opacity-100 max-md:opacity-100"
        >
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              !open && '-rotate-90',
            )}
          />
        </button>
      </div>
      {open && (
        <SortableContext
          items={projects.map((project) => projectDndId(project.id))}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={setProjectContainerRef}
            data-project-container={area.id}
            className="flex flex-col gap-px"
          >
            {projects.map(renderProject)}
          </div>
        </SortableContext>
      )}
      {collapsedPlaceholder && (
        <SortableContext
          items={[projectDndId(projects[0].id)]}
          strategy={verticalListSortingStrategy}
        >
          <div>{renderProject(projects[0])}</div>
        </SortableContext>
      )}
    </div>
  );
}
