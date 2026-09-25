import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

/**
 * 「今天」徽标——参考 Things 3 的黄色星星:
 * When ≤ 今天（含逾期）的任务在非语境视图（Anytime/项目内等）以黄星标记，
 * 表达「该任务已进入今天」而非「已逾期」——When 是计划开始日，永不逾期，
 * 红色警示语义只属于 Deadline（见 TaskDueDateBadge）。
 */
export function TaskTodayBadge({ className }: Props) {
  return (
    <Star
      aria-hidden
      className={cn('h-3.5 w-3.5 fill-amber-400 text-amber-400', className)}
    />
  );
}
