import { ChevronRight, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';

interface Props {
  project: ProjectResponseDto;
  taskCount?: number;
  showChevron?: boolean;
}

export function ProjectItem({ project, taskCount, showChevron = true }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/projects/${project.id}`)}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <Folder className="h-4 w-4 text-primary" />
      <span className={cn(
        'flex-1 truncate text-sm',
        !project.title && 'text-muted-foreground',
      )}>
        {project.title || t('project:newItemPlaceholder')}
      </span>
      {typeof taskCount === 'number' && (
        <span className="text-xs text-muted-foreground">{taskCount}</span>
      )}
      {showChevron && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}