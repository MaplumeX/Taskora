import * as React from 'react';
import { DayPicker, type DayButtonProps, type Locale } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

export type CalendarProps = {
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  locale?: Locale;
  weekStartsOn?: 0 | 1;
  autoFocus?: boolean;
  className?: string;
};

/**
 * react-day-picker v10 会把 modifier 类（selected/today/disabled/outside）挂到
 * 外层 td（day）而不是日期按钮上。td 无固定尺寸，会把「圆形选中」渲染成歪的
 * 圆角矩形，且与按钮自身的 hover 背景分层叠加。因此日期的视觉状态改由自定义
 * DayButton 直接挂在 <button> 上，td 只负责布局。
 *
 * 注意：必须保留默认实现的 focused → focus() 副作用，否则 autoFocus 失效。
 */
function CalendarDayButton({ modifiers, className, ...props }: DayButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const { selected, today, outside, disabled } = modifiers;

  return (
    <button
      ref={ref}
      className={cn(
        // 选中态自带 hover 覆盖，避免与通用 hover 的 accent 背景冲突。
        selected
          ? 'bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90'
          : today
            ? cn(
                'font-semibold text-primary hover:bg-accent hover:text-accent-foreground',
                'after:absolute after:bottom-[3px] after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-primary after:content-[""]',
              )
            : 'hover:bg-accent hover:text-accent-foreground',
        outside && !selected && 'text-muted-foreground/50',
        disabled && 'text-muted-foreground/40',
        className,
      )}
      {...props}
    />
  );
}

const dayButtonClassNames = cn(
  'relative inline-flex items-center justify-center rounded-full size-8 text-sm font-normal tabular-nums',
  'cursor-default select-none transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'max-md:size-9 max-md:font-medium',
);

export function Calendar({
  selected,
  onSelect,
  locale,
  weekStartsOn,
  autoFocus,
  className,
}: CalendarProps) {
  return (
    <DayPicker
      mode="single"
      selected={selected}
      onSelect={onSelect}
      locale={locale}
      weekStartsOn={weekStartsOn}
      autoFocus={autoFocus}
      className={cn('p-3 rounded-lg', className)}
      classNames={{
        root: 'text-foreground',
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-2.5',
        month_caption: 'flex justify-center items-center h-8',
        caption_label: 'text-sm font-semibold tracking-wide',
        nav: 'flex items-center justify-between absolute inset-x-1 top-3',
        button_previous:
          'inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none max-md:size-11 max-md:rounded-full',
        button_next:
          'inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none max-md:size-11 max-md:rounded-full',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex pb-1',
        weekday:
          'flex-1 text-center text-muted-foreground text-xs font-medium uppercase tracking-wide',
        week: 'flex w-full mt-2',
        day: 'flex-1 p-0 text-center',
        day_button: dayButtonClassNames,
        // modifier 类只会挂到 td 上，视觉状态统一在 CalendarDayButton 里处理，
        // 因此这里不再提供 selected/today/outside/disabled 的样式。
        hidden: 'invisible',
      }}
      components={{
        Chevron: ({ orientation, ...props }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" {...props} />
          ) : (
            <ChevronRight className="size-4" {...props} />
          ),
        DayButton: CalendarDayButton,
      }}
    />
  );
}
