import { ListChecks } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SubtaskResponseDto } from '@taskora/shared';

interface Props {
  /** Subtasks；空数组或 undefined 不渲染。 */
  subtasks?: SubtaskResponseDto[];
  className?: string;
}

/** Task 行上的子任务徽标：清单图标，紧贴标题文本显示（参考 Things 3）。 */
export function TaskSubtasksBadge({ subtasks, className }: Props) {
  if (!subtasks?.length) return null;
  return (
    <span
      data-subtasks-badge
      className={cn('inline-flex items-center text-xs text-muted-foreground', className)}
    >
      <ListChecks className="h-3 w-3" />
    </span>
  );
}
