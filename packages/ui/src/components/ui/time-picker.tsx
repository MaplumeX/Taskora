import * as React from 'react';

import { cn } from '@/lib/utils';

import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type TimePickerProps = {
  /** 当前时刻（HH:mm，24 小时制）；null 显示占位。 */
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** trigger 的无障碍名称。 */
  'aria-label': string;
  hourLabel: string;
  minuteLabel: string;
  className?: string;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const pad = (n: number) => String(n).padStart(2, '0');

function parseTime(value: string | null): { hour: number; minute: number } | null {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * 时刻选择器：trigger 显示 HH:mm，点开为小时（0–23）、分钟（0–59）两列
 * 滚动列表，打开时当前值滚到列中央。点任一列即写入（保留另一列的值），
 * ↑/↓ 在列内移动焦点。
 *
 * 弹层用不透明底色：它叠在字段 popover 之上，半透明毛玻璃会透出下层
 * 日历，且 backdrop-filter 在软件渲染的 WebView 上不生效。
 */
export function TimePicker({
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  hourLabel,
  minuteLabel,
  className,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const parsed = parseTime(value);

  const pickHour = (hour: number) => {
    onChange(`${pad(hour)}:${pad(parsed?.minute ?? 0)}`);
  };

  const pickMinute = (minute: number) => {
    onChange(`${pad(parsed?.hour ?? 9)}:${pad(minute)}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'inline-flex h-7 items-center rounded-md bg-muted px-2 text-sm tabular-nums transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40 data-[state=open]:bg-sidebar-accent max-md:h-9 max-md:px-3 max-md:text-[15px]',
            className,
          )}
        >
          {parsed ? `${pad(parsed.hour)}:${pad(parsed.minute)}` : '--:--'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        className="flex w-auto items-stretch gap-1 bg-popover p-1.5 backdrop-blur-none max-md:w-auto max-md:p-1.5"
        // 打开时把两列的选中项滚到中央，并聚焦小时列
        onOpenAutoFocus={(e) => {
          const selected =
            contentRef.current?.querySelectorAll<HTMLButtonElement>('[aria-selected="true"]');
          selected?.forEach((el) => el.scrollIntoView?.({ block: 'center' }));
          const first = selected?.[0];
          if (first) {
            e.preventDefault();
            first.focus({ preventScroll: true });
          }
        }}
      >
        <TimeColumn label={hourLabel} values={HOURS} selected={parsed?.hour} onPick={pickHour} />
        <div className="w-px self-stretch bg-border/60" />
        <TimeColumn
          label={minuteLabel}
          values={MINUTES}
          selected={parsed?.minute}
          onPick={pickMinute}
        />
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  values,
  selected,
  onPick,
}: {
  label: string;
  values: number[];
  selected: number | undefined;
  onPick: (value: number) => void;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = items[index + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView?.({ block: 'nearest' });
  };

  return (
    <div
      role="listbox"
      aria-label={label}
      onKeyDown={onKeyDown}
      // 窄屏模态卡片的滚动锁会拦截卡片外（portal）的滚轮 / 触摸滚动，
      // 在列内截断冒泡，让列表自己滚。
      onWheel={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      className="flex h-[196px] w-11 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:none] max-md:h-[220px] max-md:w-14 [&::-webkit-scrollbar]:hidden"
    >
      {values.map((v) => {
        const active = v === selected;
        return (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onPick(v)}
            className={cn(
              'h-7 shrink-0 cursor-default select-none rounded-md text-sm tabular-nums transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 max-md:h-10 max-md:text-[15px]',
              active
                ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90'
                : 'hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {pad(v)}
          </button>
        );
      })}
    </div>
  );
}
