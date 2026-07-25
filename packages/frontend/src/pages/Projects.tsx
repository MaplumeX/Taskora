import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { ProjectItem } from '@/components/project/ProjectItem';
import { ProjectForm } from '@/components/project/ProjectForm';
import { Button } from '@/components/ui/button';

export default function Projects() {
  const { t } = useTranslation();
  const { data: projects = [], isLoading } = useProjectsQuery();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav:projects')}</h1>
        <Button onClick={() => setOpen(true)}>{t('project:create')}</Button>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : projects.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('project:empty')}</p>
      ) : (
        <div className="flex flex-col">
          {projects.map((p) => (
            <ProjectItem key={p.id} project={p} />
          ))}
        </div>
      )}
      <ProjectForm open={open} onOpenChange={setOpen} />
    </div>
  );
}