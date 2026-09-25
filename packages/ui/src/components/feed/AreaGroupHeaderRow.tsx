import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { AreaResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { GroupHeaderRowShell } from './GroupHeaderRowShell';
import type { SelectionState } from '@taskora/api';

interface Props {
  area: AreaResponseDto;
  /** 视图内直属该 Area 的任务数（不含其下项目子组的任务）。 */
  directTaskCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  selectionState?: SelectionState;
}

/**
 * Grouped View 的领域 Group Header（分组头）：chevron + 领域标题 + 直属
 * 任务计数。点击进入领域详情。Area 无了结态，因此无进度环/完成开关。
 */
export function AreaGroupHeaderRow({
  area,
  directTaskCount,
  collapsed,
  onToggleCollapse,
  selectionState = 'idle',
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = area.title || t('area:newItemPlaceholder');

  return (
    <GroupHeaderRowShell
      parentId={area.id}
      label={label}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      selectionState={selectionState}
      onOpen={() => navigate(`/areas/${area.id}`)}
    >
      <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span
        className={cn(
          'flex-1 truncate text-left text-sm font-medium',
          area.title ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {directTaskCount > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">{directTaskCount}</span>
      )}
    </GroupHeaderRowShell>
  );
}
