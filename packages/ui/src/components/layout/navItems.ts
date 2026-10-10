import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  Circle,
  CloudSun,
  Flag,
  FolderCheck,
  Inbox,
  LayoutList,
  Notebook,
  Repeat,
  Sunrise,
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
  {
    to: '/upcoming',
    labelKey: 'nav:upcoming',
    icon: CalendarDays,
    colorClass: 'text-nav-upcoming',
  },
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

/** 明天（Tomorrow，对齐 Things 3 的隐藏列表）：Upcoming 中排在明天的条目。 */
export const tomorrowNav: NavItem = {
  to: '/tomorrow',
  labelKey: 'nav:tomorrow',
  icon: Sunrise,
  colorClass: 'text-nav-upcoming',
};

/** 重复（Repeating，Things 3 隐藏列表）：所有带 Repeat Rule 的未了结条目。 */
export const repeatingNav: NavItem = {
  to: '/repeating',
  labelKey: 'nav:repeating',
  icon: Repeat,
  colorClass: 'text-muted-foreground',
};

/** 所有项目（All Projects，Things 3 隐藏列表）：未了结项目按区域分节。 */
export const allProjectsNav: NavItem = {
  to: '/all-projects',
  labelKey: 'nav:allProjects',
  icon: LayoutList,
  colorClass: 'text-primary',
};

/** 已完成项目（Logged Projects，Things 3 隐藏列表）：Logbook 中的项目。 */
export const loggedProjectsNav: NavItem = {
  to: '/logged-projects',
  labelKey: 'nav:loggedProjects',
  icon: FolderCheck,
  colorClass: 'text-nav-logbook',
};

/**
 * 只能从 Quick Find 进入的隐藏列表（对齐 Things 3）：不在侧边栏、没有
 * 计数；Quick Find 的列表目标与页面标题共用。
 */
export const hiddenListNavs: NavItem[] = [
  tomorrowNav,
  deadlinesNav,
  repeatingNav,
  allProjectsNav,
  loggedProjectsNav,
];
