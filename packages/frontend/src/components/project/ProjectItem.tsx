import { ChevronRight, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { ProjectResponseDto } from '@taskora/shared';

interface Props {
  project: ProjectResponseDto;
  taskCount?: number;
}

export function ProjectItem({ project, taskCount }: Props) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/projects/${project.id}`)}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <Folder className="h-4 w-4 text-primary" />
      <span className="flex-1 truncate text-sm">{project.title}</span>
      {typeof taskCount === 'number' && (
        <span className="text-xs text-muted-foreground">{taskCount}</span>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}