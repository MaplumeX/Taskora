import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useLaterProjectKind, useProjectsQuery } from '@taskora/api';
import { PageHeading } from '@/components/layout/PageHeading';
import { LaterProjectSections } from '@/components/project/LaterProjectSections';

/** 无区域的稍后项目（侧边栏「N 个稍后项目」入口的目标页）。 */
export default function LaterProjects() {
  const { t } = useTranslation();
  const kindOf = useLaterProjectKind();
  const { data: allProjects = [], isLoading, isError } = useProjectsQuery();
  const projects = useMemo(
    () => allProjects.filter((p) => !p.areaId && kindOf(p) !== null),
    [allProjects, kindOf],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeading>{t('project:laterProjects')}</PageHeading>
      {isLoading ? null : isError ? (
        <p className="py-8 text-center text-sm text-destructive">{t('common:loadFailed')}</p>
      ) : projects.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('project:laterProjectsEmpty')}</p>
      ) : (
        <LaterProjectSections projects={projects} />
      )}
    </div>
  );
}
