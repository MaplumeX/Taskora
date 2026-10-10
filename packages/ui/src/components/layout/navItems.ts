import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  Circle,
  CloudSun,
  Flag,
  Inbox,
  Notebook,
  Trash2,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** 侧边栏 / 手机端首页列表 / 页面标题图标的着色（Things 3 风格，每个 Bucket 一色）。 */
  colorClass?: string;
}

/** 主导航（Sidebar / 手机端首页列表共用的单一数据源） */
export const mainNav: NavItem[] = [
  { to: '/inbox', labelKey: 'nav:inbox', icon: Inbox, colorClass: 'text-nav-inbox' },
  { to: '/today', labelKey: 'nav:today', icon: Sun, colorClass: 'text-nav-today' },
  { to: '/upcoming', labelKey: 'nav:upcoming', icon: CalendarDays, colorClass: 'text-nav-upcoming' },
  { to: '/calendar', labelKey: 'nav:calendar', icon: Calendar, colorClass: 'text-nav-calendar' },
  { to: '/anytime', labelKey: 'nav:anytime', icon: Circle, colorClass: 'text-nav-anytime' },
  { to: '/someday', labelKey: 'nav:someday', icon: CloudSun, colorClass: 'text-nav-someday' },
  { to: '/logbook', labelKey: 'nav:logbook', icon: Notebook, colorClass: 'text-nav-logbook' },
];

/** 废纸篓（不属于主导航；侧边栏工具组 / 页面标题 / 空状态共用）。 */
export const trashNav: NavItem = {
  to: '/trash',
  labelKey: 'nav:trash',
  icon: Trash2,
  colorClass: 'text-muted-foreground',
};

/** 回顾（Review）：不属于主导航；侧边栏工具组（Logbook 之前）/ 手机首页 / 回顾模式共用。 */
export const reviewNav: NavItem = {
  to: '/review',
  labelKey: 'nav:review',
  icon: CalendarCheck,
  colorClass: 'text-primary',
};

/**
 * 截止日期列表（Deadlines，对齐 Things 3 的隐藏列表）：不在侧边栏，只从
 * Quick Find 进入；页面标题共用。
 */
export const deadlinesNav: NavItem = {
  to: '/deadlines',
  labelKey: 'nav:deadlines',
  icon: Flag,
  colorClass: 'text-deadline',
};
