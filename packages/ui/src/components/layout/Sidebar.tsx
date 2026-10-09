import { NavLink, useNavigate } from 'react-router-dom';
import { Tags as TagsIcon, Settings, Notebook, Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@taskora/api';
import { useLogout } from '@taskora/api';
import { SidebarBottomBar } from '@/components/layout/SidebarBottomBar';
import { SidebarProjectSection } from '@/components/layout/SidebarProjectSection';
import { mainNav, reviewNav, trashNav, type NavItem } from '@/components/layout/navItems';
import { sidebarDropOverClass, sidebarRowClass } from '@/components/layout/sidebarRowClass';
import { useBucketCounts } from '@/components/layout/useBucketCounts';
import type { SidebarDropTarget } from '@/components/layout/sidebarDrop';
import { useSidebarDropArea, useSidebarDropTarget } from '../../lib/appDnd';
import { dndListProps } from '../../lib/dnd';
import { NewInTodayDot } from '@/components/task/NewInTodayDot';
import { useHasNewInToday, useReviewCount } from '@taskora/api';

/** 侧边栏主导航（日志移至与废纸篓同一分组） */
const SIDEBAR_MAIN_NAV = mainNav.filter((item) => item.to !== '/logbook');

/**
 * 助手：顶部独立分组（Notion AI / Linear Agent 的 copilot 位）。
 * 它是横跨所有视图的行动者，不属于任何 Bucket 视图，也不属于
 * Logbook/Trash 那类被动回顾/删除工具组。
 */
const SIDEBAR_ASSISTANT_NAV: NavItem[] = [
  { to: '/agent', labelKey: 'nav:assistant', icon: Bot, colorClass: 'text-primary' },
];

/** 回顾 + 日志 + 废纸篓：位于主导航与区域之间的中间分组 */
const SIDEBAR_UTILITIES_NAV: NavItem[] = [
  reviewNav,
  { to: '/logbook', labelKey: 'nav:logbook', icon: Notebook, colorClass: 'text-nav-logbook' },
  trashNav,
];
import { useUiInteractionStore } from '@taskora/api';
import { useProjectsQuery } from '@taskora/api';
import { useAreasQuery } from '@taskora/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** 可作为 Sidebar Drop 落点的导航行；助手、Calendar、回顾、Tags 不是落点。 */
const DROP_TARGET_BY_ROUTE: Record<string, SidebarDropTarget> = {
  '/inbox': { kind: 'inbox' },
  '/today': { kind: 'today' },
  '/upcoming': { kind: 'upcoming' },
  '/anytime': { kind: 'anytime' },
  '/someday': { kind: 'someday' },
  '/logbook': { kind: 'logbook' },
  '/trash': { kind: 'trash' },
};

const NavRow = ({
  item,
  count,
  hasNew = false,
}: {
  item: NavItem;
  count?: number;
  /** Today 有尚未看过的新到条目：计数旁带黄点（New in Today）。 */
  hasNew?: boolean;
}) => {
  const { t } = useTranslation();
  const drop = useSidebarDropTarget(DROP_TARGET_BY_ROUTE[item.to] ?? null);
  const Icon = item.icon;
  return (
    <NavLink
      ref={drop.setNodeRef}
      to={item.to}
      className={({ isActive }) =>
        sidebarRowClass(isActive, drop.isOver ? sidebarDropOverClass : undefined)
      }
    >
      <Icon className={cn('h-4 w-4 shrink-0', item.colorClass)} />
      <span className="truncate">{t(item.labelKey)}</span>
      {hasNew && (
        <span className="relative ml-auto h-1.5 w-1.5 shrink-0">
          <NewInTodayDot className="left-1/2" />
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'pl-1 text-meta font-normal tabular-nums text-muted-foreground',
            !hasNew && 'ml-auto',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
};

/** 标签只作为一个入口（进入 Tags 页），侧边栏不列出各个 Tag。 */
const TAGS_NAV: NavItem = {
  to: '/tags',
  labelKey: 'nav:tags',
  icon: TagsIcon,
  colorClass: 'text-muted-foreground',
};

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const { data: allProjects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { inboxCount, todayCount } = useBucketCounts();
  const dropArea = useSidebarDropArea();
  const hasNewInToday = useHasNewInToday();
  const reviewCount = useReviewCount();
  const countByRoute: Record<string, number> = {
    '/inbox': inboxCount,
    '/today': todayCount,
    '/review': reviewCount,
  };

  return (
    <aside
      ref={dropArea.setAreaRef}
      className="flex h-screen w-full flex-col bg-sidebar pt-[var(--sidebar-inset-top,0px)]"
    >
      {/* 桌面自绘外壳：侧边栏只为 macOS 红绿灯让位（--sidebar-inset-top），
          账号按钮叠在窗口拖拽带（z-40）之上才能点到，按钮外的空白仍可拖窗口。 */}
      <div className="px-2 pb-2 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative z-[41] w-full justify-start gap-2 px-2 font-semibold hover:bg-sidebar-accent/60"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  (user?.displayName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()
                )}
              </span>
              <span className="truncate">
                {user?.displayName ?? user?.email ?? t('common:notLoggedIn')}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="truncate">
              {user?.displayName ?? user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openSettings('account')}>
              <Settings className="h-4 w-4" />
              {t('auth:accountSettings')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void logout().then(() => navigate('/login', { replace: true }));
              }}
            >
              {t('common:logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1 px-2">
        {/* 拖拽中侧边栏不响应指针（同可拖拽列表，见 styles/tokens.css）：不接收
            被拖条目的行没有任何反应，可接收的行只显示落点高亮。 */}
        <div ref={dropArea.setContentRef} {...dndListProps}>
          {/* 助手：顶部独立分组 */}
          <div className="flex flex-col gap-px">
            {SIDEBAR_ASSISTANT_NAV.map((item) => (
              <NavRow key={item.to} item={item} />
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-px">
            {SIDEBAR_MAIN_NAV.map((item) => (
              <NavRow
                key={item.to}
                item={item}
                count={countByRoute[item.to]}
                hasNew={item.to === '/today' && hasNewInToday}
              />
            ))}
          </div>

          {/* 回顾 / 日志 / 废纸篓 */}
          <div className="mt-4 flex flex-col gap-px">
            {SIDEBAR_UTILITIES_NAV.map((item) => (
              <NavRow key={item.to} item={item} count={countByRoute[item.to]} />
            ))}
          </div>

          <div className="mt-4 flex flex-col">
            <SidebarProjectSection projects={allProjects} areas={areas} dropTargets />
          </div>

          <div className="mb-3 mt-4 flex flex-col gap-px">
            <NavRow item={TAGS_NAV} />
          </div>
        </div>
      </ScrollArea>

      <SidebarBottomBar />
    </aside>
  );
}
