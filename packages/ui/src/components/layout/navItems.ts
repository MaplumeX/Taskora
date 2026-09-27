import {
  Calendar,
  CalendarDays,
  Circle,
  CloudSun,
  Inbox,
  Notebook,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** 手机端首页列表 / 页面标题图标的着色（Things 3 风格，每个 Bucket 一色）。 */
  colorClass?: string;
}

/** 主导航（Sidebar / 手机端首页列表共用的单一数据源） */
export const mainNav: NavItem[] = [
  { to: '/inbox', labelKey: 'nav:inbox', icon: Inbox, colorClass: 'text-sky-500' },
  { to: '/today', labelKey: 'nav:today', icon: Sun, colorClass: 'text-yellow-500' },
  { to: '/upcoming', labelKey: 'nav:upcoming', icon: CalendarDays, colorClass: 'text-rose-500' },
  { to: '/calendar', labelKey: 'nav:calendar', icon: Calendar, colorClass: 'text-indigo-500' },
  { to: '/anytime', labelKey: 'nav:anytime', icon: Circle, colorClass: 'text-teal-500' },
  { to: '/someday', labelKey: 'nav:someday', icon: CloudSun, colorClass: 'text-amber-600' },
  { to: '/logbook', labelKey: 'nav:logbook', icon: Notebook, colorClass: 'text-emerald-600' },
];
