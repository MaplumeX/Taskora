import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDragToDismiss } from '../../lib/useDragToDismiss';

/**
 * 底部动作面板（iOS Action Sheet 形态）：浮在屏幕底部的圆角卡片，整行大
 * 触控目标，供触屏替代朝上弹出的 DropdownMenu。基于 Radix Dialog，
 * Escape / 遮罩点击 / Android 系统返回（合成 Escape）/ 按住面板下拉均可关闭。
 */
const ActionSheetCloseContext = React.createContext<() => void>(() => {});

/** 包一层 Root 自管 open 状态（受控 / 非受控皆可），让面板内的下拉手势能关闭自己。 */
export function ActionSheet({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const close = React.useCallback(() => setOpen(false), [setOpen]);
  return (
    <ActionSheetCloseContext.Provider value={close}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </ActionSheetCloseContext.Provider>
  );
}
export const ActionSheetTrigger = DialogPrimitive.Trigger;

export const ActionSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }
>(({ className, style, title, children, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);
  const { offset, dragging, dismissed } = useDragToDismiss(
    innerRef,
    React.useContext(ActionSheetCloseContext),
  );
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 duration-base dark:bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        ref={innerRef}
        aria-describedby={undefined}
        className={cn(
          'fixed inset-x-2 bottom-[calc(0.5rem+var(--safe-area-bottom))] z-50 mx-auto max-w-md overflow-hidden rounded-2xl border bg-popover pb-1 text-popover-foreground shadow-popover outline-none duration-base ease-spring data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:slide-in-from-bottom-8',
          className,
        )}
        style={
          {
            // 跟手时无过渡；松手未关闭则弹回。
            transform: offset ? `translateY(${offset}px)` : undefined,
            transition: dragging ? 'none' : 'transform var(--dur-base) var(--ease-spring)',
            // 下拉关闭：退场动画从松手位置继续滑出屏幕，而不是跳回原位再滑。
            ...(dismissed && {
              '--tw-exit-translate-y': 'calc(100% + 0.5rem + var(--safe-area-bottom))',
            }),
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/30" />
        <DialogPrimitive.Title className="px-4 pb-1 pt-2 text-center text-meta text-muted-foreground">
          {title}
        </DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
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
