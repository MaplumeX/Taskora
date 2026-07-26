import { ChevronRight, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { AreaResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';

interface Props {
  area: AreaResponseDto;
  projectCount?: number;
}

export function AreaItem({ area, projectCount }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/areas/${area.id}`)}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <Layers className="h-4 w-4 text-primary" />
      <span className={cn(
        'flex-1 truncate text-sm',
        !area.title && 'text-muted-foreground',
      )}>
        {area.title || t('area:newItemPlaceholder')}
      </span>
      {typeof projectCount === 'number' && (
        <span className="text-xs text-muted-foreground">{projectCount}</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}