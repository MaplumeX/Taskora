import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { SubtaskResponseDto } from '@taskora/shared';

interface Props {
  /** Subtasks；空数组或 undefined 不渲染。 */
  subtasks?: SubtaskResponseDto[];
  className?: string;
}

/** Task 行上的子任务徽标：清单图标 + 未了结子任务数（与日期/提醒/重复徽标并排，Pattern：Reminder 时钟徽标）。 */
export function TaskSubtasksBadge({ subtasks, className }: Props) {
  const { t } = useTranslation();
  if (!subtasks?.length) return null;
  const openCount = subtasks.filter((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED').length;
  return (
    <span
      data-subtasks-badge
      title={`${t('task:subtasks')} (${subtasks.length})`}
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground',
        className,
      )}
    >
      <ListChecks className="h-3 w-3" />
      {openCount > 0 && openCount}
    </span>
  );
}
