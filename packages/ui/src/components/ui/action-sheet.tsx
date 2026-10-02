import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 底部动作面板（iOS Action Sheet 形态）：浮在屏幕底部的圆角卡片，整行大
 * 触控目标，供触屏替代朝上弹出的 DropdownMenu。基于 Radix Dialog，
 * Escape / 遮罩点击 / Android 系统返回（合成 Escape）均可关闭。
 */
export const ActionSheet = DialogPrimitive.Root;
export const ActionSheetTrigger = DialogPrimitive.Trigger;

export const ActionSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }
>(({ className, title, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 duration-base dark:bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      className={cn(
        'fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md overflow-hidden rounded-2xl border bg-popover pb-1 text-popover-foreground shadow-popover outline-none duration-base ease-spring data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:slide-in-from-bottom-8',
        className,
      )}
      {...props}
    >
      <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/30" />
      <DialogPrimitive.Title className="px-4 pb-1 pt-2 text-center text-meta text-muted-foreground">
        {title}
      </DialogPrimitive.Title>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
ActionSheetContent.displayName = 'ActionSheetContent';

interface ActionSheetItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  destructive?: boolean;
}

/** 整行动作：点击后关闭面板再执行 onClick。 */
export const ActionSheetItem = React.forwardRef<HTMLButtonElement, ActionSheetItemProps>(
  ({ icon: Icon, destructive, className, children, ...props }, ref) => (
    <DialogPrimitive.Close asChild>
      <button
        ref={ref}
        type="button"
        className={cn(
          'flex h-12 w-full items-center gap-3 px-4 text-left text-[15px] transition-colors active:bg-accent disabled:opacity-50',
          destructive && 'text-destructive',
          className,
        )}
        {...props}
      >
        <Icon className={cn('h-5 w-5 shrink-0', !destructive && 'text-muted-foreground')} />
        {children}
      </button>
    </DialogPrimitive.Close>
  ),
);
ActionSheetItem.displayName = 'ActionSheetItem';

export function ActionSheetSeparator() {
  return <div role="separator" className="mx-4 my-1 h-px bg-border" />;
}
