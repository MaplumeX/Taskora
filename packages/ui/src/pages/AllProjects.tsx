import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  selectionStateOf,
  useAreasQuery,
  useProjectsQuery,
  useSelectionScope,
  useTaskRowSelection,
} from '@taskora/api';
import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';

import { EmptyState } from '@/components/common/EmptyState';
import { AreaGroupHeaderRow } from '@/components/feed/AreaGroupHeaderRow';
import { ProjectFeedRow } from '@/components/feed/ProjectFeedRow';
import { PageHeading } from '@/components/layout/PageHeading';
import { isOpenProject } from '@/components/search/quickFindResults';

interface Section {
  area: AreaResponseDto | null;
  projects: ProjectResponseDto[];
}

/**
 * 按区域分节：无区域的项目在最前，之后每个有项目的 Area 一节；节顺序与
 * 节内项目顺序都跟随侧边栏（数组顺序即侧边栏顺序）。
 */
export function allProjectSections(
  projects: ProjectResponseDto[],
  areas: AreaResponseDto[],
): Section[] {
  const open = projects.filter(isOpenProject);
  const byArea = new Map<string, ProjectResponseDto[]>();
  for (const project of open) {
    if (!project.areaId) continue;
    byArea.set(project.areaId, [...(byArea.get(project.areaId) ?? []), project]);
  }
  const sections: Section[] = [
    { area: null, projects: open.filter((project) => !project.areaId) },
    ...areas.map((area) => ({ area, projects: byArea.get(area.id) ?? [] })),
  ];
  return sections.filter((section) => section.projects.length > 0);
}

/**
 * All Projects（对齐 Things 3 的隐藏列表）：所有未了结、未进 Trash 的项目
 * （含 Later Project），按区域分节。只从 Quick Find 进入；不可拖拽排序。
 */
export default function AllProjects() {
  const { t } = useTranslation();
  const { data: projects = [], isLoading, isError } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { selectedIds, expandedId, handleBlankClick } = useTaskRowSelection();
  const sections = useMemo(() => allProjectSections(projects, areas), [projects, areas]);

  const rows = useMemo(
    () =>
      sections.flatMap((section) =>
        section.projects.map((project) => ({
          id: project.id,
          kind: 'project' as const,
          completed: false,
          tagIds: (project.tags ?? []).map((tag) => tag.id),
          item: project,
        })),
      ),
    [sections],
  );
  useSelectionScope(rows);

  return (
    <div className="flex flex-col gap-4" onClick={handleBlankClick}>
      <PageHeading nav="/all-projects">{t('nav:allProjects')}</PageHeading>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : sections.length === 0 ? (
        <EmptyState hint={t('project:allProjectsEmpty')} />
      ) : (
        sections.map((section) => (
          <section
            key={section.area?.id ?? 'no-area'}
            aria-label={section.area ? section.area.title : t('project:noArea')}
            className="flex flex-col"
          >
            {section.area && <AreaGroupHeaderRow area={section.area} />}
            <div className="flex flex-col pt-1">
              {section.projects.map((project) => (
                <ProjectFeedRow
                  key={project.id}
                  item={project}
                  selectionState={selectionStateOf(selectedIds, expandedId, project.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
