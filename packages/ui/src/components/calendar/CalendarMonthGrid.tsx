import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TaskResponseDto } from '@taskora/shared';

import { CalendarDayCell } from './CalendarDayCell';
import { buildMonthCells, buildWeekdayLabels, type WeekStartsOn } from '@taskora/api';
import { toInputDateValue, type RepeatPreview } from '@taskora/api';
import { useIsDesktop } from '../../lib/use-media-query';

interface CalendarMonthGridProps {
  anchor: Date;
  tasksByDate: Map<string, TaskResponseDto[]>;
  /** 下次预告（按日期键）。 */
  previewsByDate?: Map<string, RepeatPreview[]>;
  weekStartsOn: WeekStartsOn;
  locale: string;
  /** 键盘 Selection 当前选中的任务 id（跨格共享）。 */
  selectedIds?: string[];
  /** 点击日格：打开当天的完整列表。 */
  onOpenDay: (date: Date) => void;
}

/**
 * 日格内的纵向尺寸（与 CalendarDayCell 的 class 保持一致）：
 * 日期行高 + 上下内边距，色块高 + 间距。
 */
const CELL_METRICS = {
  narrow: { headerPx: 20, chipPitchPx: 15 },
  wide: { headerPx: 32, chipPitchPx: 22 },
} as const;
/** 测不到高度（测试环境 / 首帧）时的默认容量。 */
const DEFAULT_CAPACITY = 4;

/** 按网格实际高度计算每格可放的色块行数（6 行等高）。 */
function useCellCapacity(metrics: { headerPx: number; chipPitchPx: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  const { headerPx, chipPitchPx } = metrics;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rowHeight = el.clientHeight / 6;
      if (rowHeight <= 0) return;
      setCapacity(Math.max(1, Math.floor((rowHeight - headerPx) / chipPitchPx)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [headerPx, chipPitchPx]);

  return { ref, capacity };
}

/**
 * 月网格（滴答清单式）：细线分隔、格内浅底任务色块，每格可放条数按
 * 实际高度计算，点格子经 onOpenDay 打开当天列表。窄屏与宽屏同一结构，
 * 仅字号 / 色块尺寸不同。
 */
export function CalendarMonthGrid({
  anchor,
  tasksByDate,
  previewsByDate,
  weekStartsOn,
  locale,
  selectedIds = [],
  onOpenDay,
}: CalendarMonthGridProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const cells = useMemo(() => buildMonthCells(anchor, weekStartsOn), [anchor, weekStartsOn]);
  const weekdayLabels = useMemo(
    () => buildWeekdayLabels(locale, weekStartsOn),
    [locale, weekStartsOn],
  );
  const weekdayLabelsNarrow = useMemo(
    () => buildWeekdayLabels(locale, weekStartsOn, 'narrow'),
    [locale, weekStartsOn],
  );
  const { ref: gridRef, capacity } = useCellCapacity(
    isDesktop ? CELL_METRICS.wide : CELL_METRICS.narrow,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7">
        {weekdayLabels.map((label, i) => (
          <span
            key={label}
            className="pb-1 text-center text-[11px] font-medium text-muted-foreground md:pb-1.5 md:text-meta"
          >
            <span className="md:hidden" aria-hidden>
              {weekdayLabelsNarrow[i]}
            </span>
            <span className="hidden md:inline">{label}</span>
          </span>
        ))}
      </div>
      <div
        ref={gridRef}
        aria-label={t('calendar:monthGridLabel')}
        className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[repeat(6,minmax(72px,1fr))] border-b border-border/60 md:grid-rows-[repeat(6,minmax(96px,1fr))]"
      >
        {cells.map((date) => (
          <CalendarDayCell
            key={date.toISOString()}
            date={date}
            tasks={tasksByDate.get(toInputDateValue(date)) ?? []}
            previews={previewsByDate?.get(toInputDateValue(date))}
            capacity={capacity}
            outOfMonth={date.getMonth() !== anchor.getMonth()}
            selectedIds={selectedIds}
            onOpen={onOpenDay}
          />
        ))}
      </div>
    </div>
  );
}
