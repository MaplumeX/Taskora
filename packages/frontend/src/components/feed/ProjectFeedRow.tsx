import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectFeedItem, ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { TaskDueDateBadge } from '@/components/task/TaskDueDateBadge';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import {
  useCompleteProject,
  useUncompleteProject,
} from '@/lib/hooks/useProjects';

interface Props {
  item: ProjectFeedItem;
  showScheduledBadge?: boolean;
}

export function ProjectFeedRow({ item, showScheduledBadge = true }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();
  const completed = item.status === 'COMPLETED';
  const trashed = item.trashedAt !== null;

  const projectCast = item as unknown as ProjectResponseDto;

  const handleToggle = () => {
    (completed ? uncompleteProject : completeProject).mutate(item.id, {
      onError: () => toast.error(t('common:saveFailed')),
    });
  };

  return (
    <ProjectContextMenu
      project={projectCast}
      current={projectCast}
      variant={trashed ? 'trash' : 'default'}
    >
      <div
        data-task-item
        className="group flex h-10 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-accent/40 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/projects/${item.id}`);
        }}
        role="button"
        tabIndex={0}
      >
        <ProjectProgressRing
          total={item.taskTotalCount}
          completed={item.taskCompletedCount}
          projectStatus={item.status as ProjectStatus}
          onToggle={handleToggle}
        />
        <span
          className={cn(
            'flex-1 truncate text-left text-sm',
            completed || trashed
              ? 'text-muted-foreground line-through'
              : item.title
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {item.title || t('project:newItemPlaceholder')}
        </span>
        <div className="flex items-center gap-2">
          {item.tags.length > 0 && (
            <div className="hidden items-center gap-1 sm:flex">
              {item.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  title={tag.title}
                />
              ))}
            </div>
          )}
          {showScheduledBadge && (
            <TaskDateBadge scheduledDate={item.scheduledDate} />
          )}
          <TaskDueDateBadge dueDate={item.dueDate} />
        </div>
      </div>
    </ProjectContextMenu>
  );
}