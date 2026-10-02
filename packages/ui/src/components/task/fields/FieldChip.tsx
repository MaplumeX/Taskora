import * as React from 'react';
import { Star } from 'lucide-react';
import type { TFunction } from 'i18next';

import { ScheduledType } from '@taskora/shared';
import { formatShortDate, parseCalendarDate, startOfTomorrow } from '@taskora/api';

import { Button } from '@/components/ui/button';
import { FieldPicker } from '@/components/common/FieldPicker';
import { cn } from '@/lib/utils';
import type { ScheduledFieldCurrent } from './fieldProps';

/**
 * 字段底栏的两种入口（Things 3 展开任务的底栏）：已设值字段在左侧显示为
 * chip，未设值字段在右侧为图标按钮，点击都打开同一个字段编辑器。展开任务
 * （TaskRowExpanded）与 Quick Add 卡片共用。
 */

/** chip / 图标按钮共有的选择器控制：hint 键位、受控打开、编辑器内容。 */
interface PickerControl {
  shortcut?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}

/** 计划日期 chip 的文案与图标；未设计划时为 null（显示图标按钮）。 */
export function scheduledChipOf(
  current: ScheduledFieldCurrent,
  t: TFunction,
): { text: string; icon?: React.ReactNode } | null {
  const scheduledType = current.scheduledType ?? ScheduledType.NONE;
  if (scheduledType === ScheduledType.SOMEDAY) return { text: t('nav:someday') };
  if (scheduledType !== ScheduledType.DATE || !current.scheduledDate) return null;
  const date = parseCalendarDate(current.scheduledDate);
  const onOrBeforeToday = date < startOfTomorrow();
  const label = onOrBeforeToday ? t('common:today') : formatShortDate(date);
  return {
    text: current.reminderTime ? `${label} ${current.reminderTime}` : label,
    icon: onOrBeforeToday ? <Star className="h-3.5 w-3.5 fill-today text-today" /> : undefined,
  };
}

/** 已设值字段的 chip：图标 + 值文案，点击打开字段编辑器。 */
export function FieldChip({
  label,
  icon,
  text,
  urgent,
  shortcut,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  text: string;
  urgent?: boolean;
} & PickerControl) {
  return (
    <FieldPicker
      label={label}
      tooltip
      shortcut={shortcut}
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-7 max-w-[14rem] items-center gap-1.5 rounded-md bg-muted px-2 text-meta font-medium transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-9 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
            // 图标走 color 继承（默认 muted）；带自身语义色的图标（如今天的黄星）
            // 由 svg 上的 color 类覆盖继承值。文案单独取前景色。
            urgent ? 'text-deadline' : 'text-muted-foreground',
          )}
        >
          {icon}
          <span className={cn('truncate', !urgent && 'text-foreground')}>{text}</span>
        </button>
      }
    >
      {children}
    </FieldPicker>
  );
}

/** 未设值字段的图标按钮：点击打开字段编辑器。 */
export function FieldIconButton({
  label,
  icon,
  shortcut,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  icon: React.ReactNode;
} & PickerControl) {
  return (
    <FieldPicker
      label={label}
      tooltip
      shortcut={shortcut}
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground max-md:h-11 max-md:w-11"
          aria-label={label}
        >
          {icon}
        </Button>
      }
    >
      {children}
    </FieldPicker>
  );
}
