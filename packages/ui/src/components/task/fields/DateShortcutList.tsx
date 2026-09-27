import type * as React from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface DateShortcut {
  key: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onSelect: () => void;
}

/**
 * 日期弹层顶部的快捷项纵列（Things 3 的 When 弹层）：语义色图标 + 文案，
 * hover / 键盘高亮与菜单一致（蓝底白字），当前值右侧打勾。
 */
export function DateShortcutList({ items }: { items: DateShortcut[] }) {
  return (
    <div className="flex flex-col px-1 pt-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onSelect}
          className={cn(
            'group/shortcut flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-body outline-none max-md:h-11',
            'hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground',
            '[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
          )}
        >
          <span
            aria-hidden
            className="flex group-hover/shortcut:[&_svg]:text-primary-foreground group-focus-visible/shortcut:[&_svg]:text-primary-foreground"
          >
            {item.icon}
          </span>
          <span className="flex-1">{item.label}</span>
          {item.active && (
            <Check
              aria-hidden
              className="text-primary group-hover/shortcut:text-primary-foreground"
            />
          )}
        </button>
      ))}
    </div>
  );
}
