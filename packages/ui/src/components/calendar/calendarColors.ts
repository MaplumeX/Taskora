import type { CalendarColor } from '@taskora/shared';

/**
 * 订阅颜色（ADR 0023）→ Tailwind 类。完整类名写死，Tailwind 才扫得到。
 * `bar`：日程行首竖条；`border`：月网格色块左边线；`text`：日程行上的日期文字
 * （深一档，浅色主题下才看得清）。
 */
export const CALENDAR_COLOR_CLASS: Record<
  CalendarColor,
  { bar: string; border: string; text: string }
> = {
  blue: { bar: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  green: {
    bar: 'bg-green-500',
    border: 'border-green-500',
    text: 'text-green-600 dark:text-green-400',
  },
  orange: {
    bar: 'bg-orange-500',
    border: 'border-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
  },
  purple: {
    bar: 'bg-purple-500',
    border: 'border-purple-500',
    text: 'text-purple-600 dark:text-purple-400',
  },
  red: { bar: 'bg-red-500', border: 'border-red-500', text: 'text-red-600 dark:text-red-400' },
  teal: { bar: 'bg-teal-500', border: 'border-teal-500', text: 'text-teal-600 dark:text-teal-400' },
  pink: { bar: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-600 dark:text-pink-400' },
  yellow: {
    bar: 'bg-yellow-500',
    border: 'border-yellow-500',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
};
