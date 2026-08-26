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
  'relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors';

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
            ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
            : 'hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {children}
      </button>
    );
  },
);
MenuRow.displayName = 'MenuRow';