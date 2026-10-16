import * as React from 'react';
import { Archive, Star, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Start } from '@taskora/shared';
import {
  formatDeadlineCountdown,
  formatShortDate,
  parseCalendarDate,
  startOfTomorrow,
} from '@taskora/api';

import { Button } from '@/components/ui/button';
import { FieldPicker } from '@/components/common/FieldPicker';
import { cn } from '@/lib/utils';
import type { ScheduledFieldCurrent } from './fieldProps';

/**
 * 字段底栏的两种入口（Things 3 展开任务）：已设值字段在左侧纵向排列，每个
 * 字段一行（FieldChip），未设值字段在右下为图标按钮，点击都打开同一个字段
 * 编辑器。展开任务（TaskRowExpanded）与 Quick Add 卡片共用。
 */

/** 字段行 / 图标按钮共有的选择器控制：hint 键位（仅图标按钮有 hint）、受控打开、编辑器内容。 */
interface PickerControl {
  shortcut?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}

/** 计划日期行的文案与图标；未设计划时为 null（显示图标按钮）。 */
export function scheduledChipOf(
  current: ScheduledFieldCurrent,
  t: TFunction,
): { text: string; icon?: React.ReactNode } | null {
  if (current.start === Start.SOMEDAY) return { text: t('nav:someday'), icon: <Archive /> };
  if (!current.scheduledDate) return null;
  const date = parseCalendarDate(current.scheduledDate);
  const onOrBeforeToday = date < startOfTomorrow();
  const label = onOrBeforeToday ? t('common:today') : formatShortDate(date);
  return {
    text: current.reminderTime ? `${label} ${current.reminderTime}` : label,
    icon: onOrBeforeToday ? <Star className="h-3.5 w-3.5 fill-today text-today" /> : undefined,
  };
}

/**
 * 已设值字段的一行（Things 3）：静止时无底无框，只有语义色图标 + 值；悬停
 * 或选择器打开时浮出细描边与轻阴影。传 onClear 时尾部露出 ×，一键清空该字段；
 * × 的位置始终预留，悬停时行宽不变（窄屏无悬停，不显示 ×，清除仍走编辑器）。
 */
export function FieldChip({
  label,
  icon,
  text,
  urgent,
  onClear,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  /** 值文案；也可以是节点（如标签胶囊）。 */
  text: React.ReactNode;
  urgent?: boolean;
  onClear?: () => void;
} & Omit<PickerControl, 'shortcut'>) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'group/chip inline-flex h-7 max-w-full items-center rounded-md transition-shadow hover:shadow-sm hover:ring-1 hover:ring-inset hover:ring-border has-[[aria-expanded=true]]:shadow-sm has-[[aria-expanded=true]]:ring-1 has-[[aria-expanded=true]]:ring-inset has-[[aria-expanded=true]]:ring-border max-md:h-9',
        // 图标走 color 继承（默认 muted）；带自身语义色的图标（如今天的黄星）
        // 由 svg 上的 color 类覆盖继承值。文案单独取前景色。
        urgent ? 'text-deadline' : 'text-muted-foreground',
      )}
    >
      <FieldPicker
        label={label}
        open={open}
        onOpenChange={onOpenChange}
        trigger={
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex h-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0',
              onClear && 'md:pr-0.5',
            )}
          >
            {icon}
            <span
              className={cn(
                'flex min-w-0 items-center gap-1 truncate',
                !urgent && 'text-foreground',
              )}
            >
              {text}
            </span>
          </button>
        }
      >
        {children}
      </FieldPicker>
      {onClear && (
        <button
          type="button"
          aria-label={t('common:clearField', { field: label })}
          className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover/chip:opacity-100 max-md:hidden"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
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

/** 截止日期行的文案：「截止：9月2日 · 还剩 3 天」。 */
export function deadlineChipText(dueDate: Date, t: TFunction): string {
  return t('task:deadlineChip', {
    date: formatShortDate(dueDate),
    countdown: formatDeadlineCountdown(dueDate),
  });
}
