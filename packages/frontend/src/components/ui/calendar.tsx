import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Locale } from 'react-day-picker';

import { cn } from '@/lib/utils';

export type CalendarProps = {
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  locale?: Locale;
  weekStartsOn?: 0 | 1;
  autoFocus?: boolean;
  className?: string;
};

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
      className={cn('p-3', className)}
      classNames={{
        root: 'text-foreground',
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center items-center h-8',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center justify-between absolute inset-x-1 top-3',
        button_previous:
          'inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none',
        button_next:
          'inline-flex items-center justify-center rounded-md size-7 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'flex-1 text-muted-foreground rounded-md w-9 text-[0.8rem] font-normal',
        week: 'flex w-full mt-2',
        day: cn(
          'flex-1 p-0 text-center text-sm',
          'rdp-day relative',
        ),
        day_button:
          'inline-flex items-center justify-center rounded-full size-9 text-sm tabular-nums transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30 disabled:pointer-events-none',
        outside: 'text-muted-foreground/50',
        today:
          'after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-primary after:content-[""]',
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-ring font-medium',
        disabled: 'text-muted-foreground/40',
        hidden: 'invisible',
      }}
      components={{
        Chevron: ({ orientation, ...props }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" {...props} />
          ) : (
            <ChevronRight className="size-4" {...props} />
          ),
      }}
    />
  );
}