import { Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ProjectFeedItem } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { TaskDueDateBadge } from '@/components/task/TaskDueDateBadge';

interface Props {
  item: ProjectFeedItem;
}

export function ProjectFeedRow({ item }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const completed = item.status === 'COMPLETED';
  const trashed = item.status === 'TRASHED';

  return (
    <div
      data-task-item
      className="group flex h-10 items-center gap-3 px-2 transition-colors hover:bg-accent/40 cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/projects/${item.id}`);
      }}
      role="button"
      tabIndex={0}
    >
      <Folder
        className={cn(
          'h-4 w-4 shrink-0 text-primary',
          (completed || trashed) && 'text-muted-foreground',
        )}
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
        <TaskDateBadge scheduledDate={item.scheduledDate} />
        <TaskDueDateBadge dueDate={item.dueDate} />
      </div>
    </div>
  );
}