import { ChevronRight, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { AreaResponseDto } from '@taskora/shared';

interface Props {
  area: AreaResponseDto;
  projectCount?: number;
}

export function AreaItem({ area, projectCount }: Props) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/areas/${area.id}`)}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <Layers className="h-4 w-4 text-primary" />
      <span className="flex-1 truncate text-sm">{area.title}</span>
      {typeof projectCount === 'number' && (
        <span className="text-xs text-muted-foreground">{projectCount}</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}