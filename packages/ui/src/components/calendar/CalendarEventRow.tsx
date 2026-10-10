import { useTranslation } from 'react-i18next';

import { formatShortDate, fromInputDateValue, type DayCalendarEvent } from '@taskora/api';

import { cn } from '@/lib/utils';
import { CALENDAR_COLOR_CLASS } from './calendarColors';

interface Props {
  entry: DayCalendarEvent;
  /** 当前时刻（毫秒）：已结束的日程标题改用灰色字；不传则不区分。 */
  now?: number;
  /**
   * 分组标题不含具体日期时（Upcoming 月份分组），时间前显示短日期：订阅颜色
   * 的文字、无底色，与任务行的灰色日期 chip 区分开。
   */
  showDate?: boolean;
  /** 复选框槽位里的订阅颜色竖条；关掉时连槽位一起去掉，内容贴左。 */
  colorBar?: boolean;
}

/**
 * 日程行（Calendar Event，ADR 0023）：外部日历的只读日程，紧凑单行（参考
 * Things 3）。复选框槽位放订阅颜色的竖条，与任务行同一左对齐；只显示当天
 * 的开始时间，全天日程与从前一天延续来的不显示时间。不可点击 / 拖拽，也不
 * 进 Selection。
 */
export function CalendarEventRow({ entry, now, showDate = false, colorBar = true }: Props) {
  const { t } = useTranslation();
  const { event } = entry;
  const ended = now !== undefined && entry.endsAt <= now;
  return (
    <div
      data-calendar-event-row={event.id}
      data-ended={ended || undefined}
      title={event.location ?? undefined}
      className="flex h-6 min-w-0 select-none items-center gap-2.5 px-2 max-md:h-8"
    >
      {colorBar && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
          <span className={cn('h-3 w-1 rounded-full', CALENDAR_COLOR_CLASS[event.color].bar)} />
        </span>
      )}
      {showDate && (
        <span
          data-calendar-event-date
          className={cn(
            'shrink-0 text-meta font-medium tabular-nums',
            CALENDAR_COLOR_CLASS[event.color].text,
          )}
        >
          {formatShortDate(fromInputDateValue(entry.dateKey))}
        </span>
      )}
      {entry.startTime && (
        <span className="shrink-0 text-meta tabular-nums text-muted-foreground">
          {entry.startTime}
        </span>
      )}
      {/* 已结束只换灰色字，不用整行透明度：叠在灰底上会发雾、看不清 */}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[13px] leading-5',
          ended && 'text-muted-foreground',
        )}
      >
        {event.title || t('common:empty')}
      </span>
    </div>
  );
}

/**
 * 当天的日程列表（Today / Upcoming / 日历当天面板共用）；没有日程时不渲染。
 * `boxed`：灰底圆角的一整块，与下方任务分开（Today 参考 Things 3）；
 * Upcoming 的日分组已有分组头分隔，不加底色。`showDates`：行上显示日期
 * chip（Upcoming 月份分组）。`colorBar`：行首的订阅颜色竖条（Upcoming 不显示）。
 */
export function CalendarEventList({
  entries,
  now,
  boxed = true,
  showDates = false,
  colorBar = true,
  className,
}: {
  entries: readonly DayCalendarEvent[];
  now?: number;
  boxed?: boolean;
  showDates?: boolean;
  colorBar?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;
  return (
    <div
      role="list"
      aria-label={t('calendar:eventsLabel')}
      data-calendar-event-list
      className={cn('flex flex-col', boxed && 'rounded-lg bg-muted/70 py-1', className)}
    >
      {entries.map((entry) => (
        <div role="listitem" key={`${entry.dateKey}:${entry.event.id}`}>
          <CalendarEventRow entry={entry} now={now} showDate={showDates} colorBar={colorBar} />
        </div>
      ))}
    </div>
  );
}
