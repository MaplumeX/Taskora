import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import {
  useCompleteProject,
  useUncompleteProject,
} from '@/lib/hooks/useProjects';

interface Props {
  project: ProjectResponseDto;
  taskCount?: number;
  showChevron?: boolean;
}

export function ProjectItem({ project, taskCount, showChevron = true }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();

  const isCompleted = project.status === ProjectStatus.COMPLETED;

  const handleToggle = () => {
    (isCompleted ? uncompleteProject : completeProject).mutate(project.id, {
      onError: () => toast.error(t('common:saveFailed')),
    });
  };

  return (
    <ProjectContextMenu project={project} current={project}>
      <button
        type="button"
        onClick={() => navigate(`/projects/${project.id}`)}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
      >
        <ProjectProgressRing
          total={project.taskTotalCount}
          completed={project.taskCompletedCount}
          projectStatus={project.status}
          onToggle={handleToggle}
        />
        <span className={cn(
          'flex-1 truncate text-sm',
          !project.title && 'text-muted-foreground',
          isCompleted && 'text-muted-foreground line-through',
        )}>
          {project.title || t('project:newItemPlaceholder')}
        </span>
        {typeof taskCount === 'number' && (
          <span className="text-xs text-muted-foreground">{taskCount}</span>
        )}
        {showChevron && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
    </ProjectContextMenu>
  );
}