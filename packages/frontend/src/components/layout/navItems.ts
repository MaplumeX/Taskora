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
}

/** 主导航（Sidebar / MobileTabBar / MobileNavDrawer 共用的单一数据源） */
export const mainNav: NavItem[] = [
  { to: '/inbox', labelKey: 'nav:inbox', icon: Inbox },
  { to: '/today', labelKey: 'nav:today', icon: Sun },
  { to: '/upcoming', labelKey: 'nav:upcoming', icon: CalendarDays },
  { to: '/calendar', labelKey: 'nav:calendar', icon: Calendar },
  { to: '/anytime', labelKey: 'nav:anytime', icon: Circle },
  { to: '/someday', labelKey: 'nav:someday', icon: CloudSun },
  { to: '/logbook', labelKey: 'nav:logbook', icon: Notebook },
];
