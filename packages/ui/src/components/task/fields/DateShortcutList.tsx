import type * as React from 'react';
import { CalendarX2 } from 'lucide-react';

import { Hint } from '@/components/ui/hint';
import { cn } from '@/lib/utils';

export interface DateShortcut {
  key: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
}

interface Props {
  items: DateShortcut[];
  /** 行尾的清除按钮（取代原先单独一行的底部「清除」）；不可清除的日期不给。 */
  clear?: { label: string; disabled?: boolean; onClear: () => void };
}

/**
 * 日期弹层顶部的快捷项横排（Things 3 的 When 弹层）：语义色图标 + 文案，
 * 当前值高亮；行尾是图标式清除按钮（日历 ✕，与窄屏卡片的关闭 ✕ 区分）。
 * 横排而非纵列，压低弹层整体高度。
 */
export function DateShortcutList({ items, clear }: Props) {
  return (
    <div className="flex items-center gap-0.5 pt-0.5 max-md:gap-1 max-md:px-1 max-md:pt-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={!!item.active}
          onClick={item.onSelect}
          className={cn(
            'flex h-7 min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 text-meta outline-none transition-colors duration-fast max-md:h-10 max-md:gap-1.5 max-md:text-sm',
            'focus-visible:ring-2 focus-visible:ring-ring/60',
            '[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0 max-md:[&_svg]:h-4 max-md:[&_svg]:w-4',
            item.active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent',
          )}
        >
          <span aria-hidden className="flex">
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
      {clear && (
        <Hint label={clear.label}>
          <button
            type="button"
            aria-label={clear.label}
            disabled={clear.disabled}
            onClick={clear.onClear}
            className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-30 max-md:h-10 max-md:w-10"
          >
            <CalendarX2 aria-hidden className="h-3.5 w-3.5 max-md:h-4 max-md:w-4" />
          </button>
        </Hint>
      )}
    </div>
  );
}
