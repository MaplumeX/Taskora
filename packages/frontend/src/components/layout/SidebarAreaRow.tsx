import * as React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { ProjectItem } from '@/components/project/ProjectItem';

interface Props {
  area: AreaResponseDto;
  projects: ProjectResponseDto[];
}

/**
 * 侧边栏合并后的区域条目。主体点击进入区域详情；右侧 chevron 仅切换展开/收起。
 * 展开后用 ProjectItem 渲染属于该区域的项目，空时提示「该区域下没有项目」。
 */
export function SidebarAreaRow({ area, projects }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(true);
  const label = area.title || t('area:newItemPlaceholder');

  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative flex items-center">
        <NavLink
          to={`/areas/${area.id}`}
          className={({ isActive }) =>
            cn(
              'flex flex-1 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              isActive && 'bg-accent font-medium text-foreground',
            )
          }
        >
          <Layers className="h-4 w-4" />
          <span className={cn('flex-1 truncate', !area.title && 'text-muted-foreground')}>
            {label}
          </span>
        </NavLink>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen((v) => !v);
          }}
          aria-label={open ? t('nav:collapse', { label }) : t('nav:expand', { label })}
          className="absolute right-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')}
          />
        </button>
      </div>
      {open && projects.length > 0 && (
        <div className="ml-4 flex flex-col gap-0.5 border-l pl-2">
          {projects.map((p) => <ProjectItem key={p.id} project={p} showChevron={false} />)}
        </div>
      )}
    </div>
  );
}
