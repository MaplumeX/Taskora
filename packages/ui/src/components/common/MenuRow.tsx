import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface MenuRowProps {
  icon: LucideIcon;
  destructive?: boolean;
  /** 不可用：保留可聚焦与 title 提示（原生 disabled 按钮不显示 title），点击无效。 */
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}

const BASE_CLASS =
  'relative flex h-7 w-full cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none max-md:h-11';
export const MenuRow = React.forwardRef<HTMLButtonElement, MenuRowProps>(
  ({ icon: Icon, destructive, disabled, title, onClick, children }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        title={title}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        className={cn(
          BASE_CLASS,
          disabled
            ? 'text-muted-foreground'
            : destructive
              ? 'text-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:bg-destructive focus-visible:text-destructive-foreground'
              : 'hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {children}
      </button>
    );
  },
);
MenuRow.displayName = 'MenuRow';
