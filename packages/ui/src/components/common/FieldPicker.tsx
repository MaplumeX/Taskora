import * as React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Hint } from '@/components/ui/hint';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsDesktop } from '../../lib/use-media-query';

interface Props {
  /** 字段名：窄屏卡片标题；宽屏作为 trigger 的 hover 提示（tooltip 为真时）。 */
  label: string;
  /** 宽屏是否给 trigger 套 Hint 提示气泡（触屏无 hover，窄屏不套）。 */
  tooltip?: boolean;
  /** 触发按钮（asChild 注入 trigger 行为）。 */
  trigger: React.ReactElement;
  /** hint 上附带的键位文案（宽屏、tooltip 为真时）。 */
  shortcut?: string;
  /** 受控打开（如快捷键直接打开选择器）；不传则自管。 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}

/**
 * 字段选择器容器（计划日期 / 重复 / 截止日期 / 标签）。
 *
 * - 宽屏：锚定在 trigger 旁的 Popover。
 * - 窄屏：居中模态卡片（Things 3 iPhone）——遮罩、标题、44px 关闭按钮，
 *   垂直居中于「视口 − 键盘」区域，超高时内容区滚动。
 *
 * 字段组件不感知容器，通过 `close` 回调在选定后关闭。
 */
export function FieldPicker({
  label,
  tooltip = false,
  trigger,
  shortcut,
  open: controlledOpen,
  onOpenChange,
  children,
}: Props) {
  const isDesktop = useIsDesktop();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);
  const body = typeof children === 'function' ? children(close) : children;

  if (isDesktop) {
    const popoverTrigger = <PopoverTrigger asChild>{trigger}</PopoverTrigger>;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        {tooltip ? (
          <Hint label={label} shortcut={shortcut}>
            {popoverTrigger}
          </Hint>
        ) : (
          popoverTrigger
        )}
        <PopoverContent align="start" className="p-1.5">
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <FieldPickerDialog label={label} open={open} onOpenChange={setOpen} trigger={trigger}>
      {body}
    </FieldPickerDialog>
  );
}

interface DialogProps {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 可选触发按钮；无 trigger 时由调用方受控打开（如多选工具栏）。 */
  trigger?: React.ReactElement;
  children: React.ReactNode;
}

/**
 * 窄屏字段卡片（受控）：FieldPicker 的窄屏形态，也供没有锚点按钮的入口
 * （多选工具栏）直接使用。
 */
export function FieldPickerDialog({ label, open, onOpenChange, trigger, children }: DialogProps) {
  const { t } = useTranslation();
  const contentRef = React.useRef<HTMLDivElement>(null);

  return (
    // Portal 内事件仍沿 React 树冒泡：截断遮罩点击与卡片内 Escape，
    // 避免宿主行（TaskItem 的 Escape 收起 / 行点击）被误触发。
    <span
      className="contents"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }}
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent
          ref={contentRef}
          hideClose
          aria-describedby={undefined}
          // 不自动聚焦首个控件（会弹键盘 / 显示焦点环），改聚焦卡片本身。
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.focus();
          }}
          className="top-[calc((100dvh-var(--kb-inset,0px))/2)] flex max-h-[calc(100dvh-var(--kb-inset,0px)-2rem)] w-[min(22rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 outline-none sm:rounded-2xl max-md:max-w-none"
        >
          <div className="flex shrink-0 items-center justify-between pl-4 pr-1 pt-1">
            <DialogTitle className="text-base font-semibold">{label}</DialogTitle>
            <DialogClose
              aria-label={t('common:close')}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-accent"
            >
              <X className="h-5 w-5" />
            </DialogClose>
          </div>
          <div className="min-h-0 overflow-y-auto px-2 pb-2">{children}</div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
