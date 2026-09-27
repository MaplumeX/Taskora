import { useTranslation } from 'react-i18next';

import type { TaskResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { i18n, isOverdue, isToday, parseCalendarDate, toInputDateValue } from '@taskora/api';

interface Props {
  date: Date;
  tasks: TaskResponseDto[];
  /** 格内最多可放的色块行数（含「+N」行）。 */
  capacity: number;
  outOfMonth?: boolean;
  /** 键盘 Selection 当前选中的任务 id（色块描边高亮）。 */
  selectedIds?: string[];
  onOpen: (date: Date) => void;
}

/** 截止日期 ≤ 今天（到期 / 逾期）的未了结任务：红色语义只属于 Deadline。 */
function isDeadlineUrgent(task: TaskResponseDto): boolean {
  if (!task.dueDate || task.status !== 'ACTIVE') return false;
  const due = parseCalendarDate(task.dueDate);
  return isOverdue(due) || isToday(due);
}

/**
 * 月网格日格（滴答清单式）：日期 + 浅底任务色块，超长截断。整格是一个
 * 按钮，点击打开当天的完整列表（CalendarDaySheet）；格内不承担单条任务
 * 的操作。窄屏 10px 小字、不加省略号以多挤一个字；宽屏 12px 并加省略号。
 * 尺寸需与 CalendarMonthGrid 的容量常量保持一致。
 */
export function CalendarDayCell({
  date,
  tasks,
  capacity,
  outOfMonth = false,
  selectedIds = [],
  onOpen,
}: Props) {
  const { t } = useTranslation();
  const todayCell = isToday(date);

  const overflow = tasks.length > capacity;
  const visible = overflow ? tasks.slice(0, Math.max(0, capacity - 1)) : tasks;
  const hiddenCount = tasks.length - visible.length;

  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);

  return (
    <button
      type="button"
      data-calendar-date={toInputDateValue(date)}
      data-out-of-month={outOfMonth || undefined}
      aria-label={t('calendar:dayCellLabel', { date: dateLabel, count: tasks.length })}
      onClick={() => onOpen(date)}
      className="flex min-h-0 min-w-0 flex-col items-stretch overflow-hidden border-t border-border/60 px-px pb-px pt-0.5 text-left transition-colors hover:bg-accent/30 active:bg-accent/60 md:px-1 md:pb-1 md:pt-1"
    >
      {/* 非本月只弱化内容，分隔线保持连续 */}
      <span
        className={cn('flex min-h-0 flex-col gap-px md:gap-0.5', outOfMonth && 'opacity-40')}
      >
        <span className="flex h-[18px] shrink-0 items-center justify-center md:h-6">
          <span
            className={cn(
              'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] tabular-nums text-muted-foreground md:h-6 md:min-w-6 md:text-xs',
              todayCell && 'bg-primary font-semibold text-primary-foreground',
            )}
          >
            {date.getDate()}
          </span>
        </span>

        {visible.map((task) => {
          const completed = task.status === 'COMPLETED';
          const cancelled = task.status === 'CANCELLED';
          return (
            <span
              key={task.id}
              data-calendar-chip
              aria-selected={selectedIds.includes(task.id) || undefined}
              className={cn(
                'block h-[14px] shrink-0 overflow-hidden whitespace-nowrap rounded-[3px] px-0.5 text-[10px] leading-[14px] text-foreground',
                'md:h-5 md:text-ellipsis md:rounded md:px-1.5 md:text-xs md:leading-5',
                isDeadlineUrgent(task) ? 'bg-deadline/15' : 'bg-primary/10',
                (completed || cancelled) && 'bg-muted text-muted-foreground',
                cancelled && 'line-through',
                selectedIds.includes(task.id) && 'ring-1 ring-inset ring-primary',
              )}
            >
              {task.title || t('common:empty')}
            </span>
          );
        })}

        {hiddenCount > 0 && (
          <span className="block h-[14px] shrink-0 px-0.5 text-[10px] font-medium leading-[14px] text-muted-foreground md:h-5 md:px-1.5 md:text-xs md:leading-5">
            <span className="md:hidden">+{hiddenCount}</span>
            <span className="hidden md:inline">
              {t('calendar:overflowMore', { count: hiddenCount })}
            </span>
          </span>
        )}
      </span>
    </button>
  );
}
