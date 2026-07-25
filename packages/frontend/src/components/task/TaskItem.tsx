import * as React from 'react';
import { Check, MoreHorizontal, Trash2 } from 'lucide-react';

import type { TaskResponseDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskDateBadge } from './TaskDateBadge';

interface Props {
  task: TaskResponseDto;
  projectTitle?: string;
  areaTitle?: string;
  onToggleComplete: () => void;
  onOpenDetail: () => void;
  onTrash: () => void;
  /** Show the detail trigger (clicking title opens dialog) */
  enableClick?: boolean;
}

export function TaskItem({
  task,
  projectTitle,
  areaTitle,
  onToggleComplete,
  onOpenDetail,
  onTrash,
  enableClick = true,
}: Props) {
  const completed = task.status === 'COMPLETED';
  const [exiting, setExiting] = React.useState(false);

  const handleToggle = () => {
    if (!completed) {
      // play exit animation before unmount via parent re-render
      setExiting(true);
      window.setTimeout(onToggleComplete, 350);
    } else {
      onToggleComplete();
    }
  };

  const tag = projectTitle ?? areaTitle;

  return (
    <div
      className={cn(
        'group flex h-12 items-center gap-3 px-2 transition-opacity',
        exiting && 'task-complete-anim',
      )}
    >
      <TaskCheckbox checked={completed} onToggle={handleToggle} />

      <button
        type="button"
        onClick={enableClick ? onOpenDetail : undefined}
        className={cn(
          'flex-1 truncate text-left text-sm transition-colors',
          completed ? 'text-muted-foreground line-through' : 'text-foreground',
        )}
      >
        {task.title}
      </button>

      <div className="flex items-center gap-2">
        {tag && (
          <span className="hidden text-xs text-muted-foreground sm:inline">{tag}</span>
        )}
        <TaskDateBadge dueDate={task.dueDate} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleToggle}>
              <Check className="mr-2 h-4 w-4" />
              {completed ? '取消完成' : '完成'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[#CC4444]" onClick={onTrash}>
              <Trash2 className="mr-2 h-4 w-4" />
              移到废纸篓
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}