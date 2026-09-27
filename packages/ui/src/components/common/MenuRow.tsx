import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface MenuRowProps {
  icon: LucideIcon;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const BASE_CLASS =
  'relative flex h-7 w-full cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none max-md:h-11';
export const MenuRow = React.forwardRef<HTMLButtonElement, MenuRowProps>(
  ({ icon: Icon, destructive, onClick, children }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          BASE_CLASS,
          destructive
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