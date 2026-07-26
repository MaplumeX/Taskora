import { useTranslation } from 'react-i18next';

import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { SidebarAreaRow } from '@/components/layout/SidebarAreaRow';
import { ProjectItem } from '@/components/project/ProjectItem';

interface Props {
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
}

/**
 * 侧边栏合并后的统一「项目」section：标题为纯文本（无折叠按钮、无导航链接）。
 * 内容顺序：顶部列出无区域归属的项目，下方每个区域作为可折叠条目（含该区域项目列表）。
 */
export function SidebarProjectSection({ projects, areas }: Props) {
  const { t } = useTranslation();
  const standaloneProjects = projects.filter((p) => !p.areaId);

  return (
    <div className="flex flex-col gap-1">
      <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">
        {t('nav:projects')}
      </div>
      <div className="ml-4 flex flex-col gap-0.5 border-l pl-2">
        {standaloneProjects.map((p) => (
          <ProjectItem key={p.id} project={p} />
        ))}
        {areas.map((area) => (
          <SidebarAreaRow
            key={area.id}
            area={area}
            projects={projects.filter((p) => p.areaId === area.id)}
          />
        ))}
      </div>
    </div>
  );
}
