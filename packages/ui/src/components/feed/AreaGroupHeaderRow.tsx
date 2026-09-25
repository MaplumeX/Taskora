import { Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { AreaResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { GroupHeaderRowShell } from './GroupHeaderRowShell';
import type { SelectionState } from '@taskora/api';

interface Props {
  area: AreaResponseDto;
  selectionState?: SelectionState;
}

/**
 * Grouped View 的领域 Group Header（分组头）：下横线小节标题形态，
 * 领域图标 + 领域标题。点击进入领域详情。Area 无了结态，因此无进度环/
 * 完成开关；无折叠按钮、无任务计数。
 */
export function AreaGroupHeaderRow({ area, selectionState = 'idle' }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = area.title || t('area:newItemPlaceholder');

  return (
    <GroupHeaderRowShell
      parentId={area.id}
      selectionState={selectionState}
      onOpen={() => navigate(`/areas/${area.id}`)}
    >
      {/* 与进度环等宽的 20px 槽位，保证领域组头与任务行标题对齐。 */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
      </span>
      <span
        className={cn(
          'flex-1 truncate text-left text-sm font-semibold tracking-wide',
          area.title ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </GroupHeaderRowShell>
  );
}
