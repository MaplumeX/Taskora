import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useAreasQuery } from '@/lib/hooks/useAreas';
import { useProjectsQuery } from '@/lib/hooks/useProjects';
import { AreaItem } from '@/components/area/AreaItem';
import { AreaForm } from '@/components/area/AreaForm';
import { Button } from '@/components/ui/button';

export default function Areas() {
  const { t } = useTranslation();
  const { data: areas = [], isLoading } = useAreasQuery();
  const { data: projects = [] } = useProjectsQuery();
  const [open, setOpen] = React.useState(false);

  const projectCount = (areaId: string) =>
    projects.filter((p) => p.areaId === areaId).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav:areas')}</h1>
        <Button onClick={() => setOpen(true)}>{t('area:create')}</Button>
      </div>
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : areas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('area:empty')}</p>
      ) : (
        <div className="flex flex-col">
          {areas.map((a) => (
            <AreaItem key={a.id} area={a} projectCount={projectCount(a.id)} />
          ))}
        </div>
      )}
      <AreaForm open={open} onOpenChange={setOpen} />
    </div>
  );
}