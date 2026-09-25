import { useTranslation } from 'react-i18next';
import { Check, Folder, Target } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useProjectsQuery, useAreasQuery } from '@taskora/api';

export interface MoveFieldCurrent {
  projectId?: string | null;
  areaId?: string | null;
}

export interface MoveFieldPatch {
  projectId?: string | null;
  areaId?: string | null;
}

interface FieldProps {
  current: MoveFieldCurrent;
  onPatch: (data: MoveFieldPatch) => void;
}

/**
 * 「移动」面板（右键菜单入口）：同时列出区域与项目条目，
 * 选择后改写任务的所属区域或所属项目。
 */
export function MoveField({ current, onPatch }: FieldProps) {
  const { t } = useTranslation();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();

  const rowClass = (selected: boolean) =>
    cn(
      'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent max-md:py-2.5',
      selected && 'font-medium text-primary',
    );

  return (
    <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
      <h4 className="flex items-center gap-1.5 px-2 pb-0.5 pt-1 text-xs font-medium text-muted-foreground">
        <Target className="h-3.5 w-3.5" />
        {t('task:area')}
      </h4>
      <button
        type="button"
        onClick={() => onPatch({ areaId: null })}
        className={rowClass(!current.areaId)}
      >
        <Check className={cn('h-3.5 w-3.5', !current.areaId ? 'opacity-100' : 'opacity-0')} />
        {t('common:none')}
      </button>
      {areas.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => a.id !== current.areaId && onPatch({ areaId: a.id })}
          className={rowClass(a.id === current.areaId)}
        >
          <Check
            className={cn('h-3.5 w-3.5', a.id === current.areaId ? 'opacity-100' : 'opacity-0')}
          />
          {a.title}
        </button>
      ))}

      <h4 className="flex items-center gap-1.5 px-2 pb-0.5 pt-2 text-xs font-medium text-muted-foreground">
        <Folder className="h-3.5 w-3.5" />
        {t('task:project')}
      </h4>
      <button
        type="button"
        onClick={() => onPatch({ projectId: null })}
        className={rowClass(!current.projectId)}
      >
        <Check className={cn('h-3.5 w-3.5', !current.projectId ? 'opacity-100' : 'opacity-0')} />
        {t('common:none')}
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => p.id !== current.projectId && onPatch({ projectId: p.id })}
          className={rowClass(p.id === current.projectId)}
        >
          <Check
            className={cn('h-3.5 w-3.5', p.id === current.projectId ? 'opacity-100' : 'opacity-0')}
          />
          {p.title}
        </button>
      ))}
    </div>
  );
}
