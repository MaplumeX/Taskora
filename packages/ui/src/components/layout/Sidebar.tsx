import * as React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Tags as TagsIcon,
  Settings,
  Notebook,
  Bot,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@taskora/api';
import { useLogout } from '@taskora/api';
import { ProjectStatus } from '@taskora/shared';
import { SidebarBottomBar } from '@/components/layout/SidebarBottomBar';
import { SidebarProjectSection } from '@/components/layout/SidebarProjectSection';
import { mainNav, trashNav, type NavItem } from '@/components/layout/navItems';
import { sidebarRowClass } from '@/components/layout/sidebarRowClass';
import { useBucketCounts } from '@/components/layout/useBucketCounts';

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

/** 日志 + 废纸篓：位于主导航与区域之间的中间分组 */
const SIDEBAR_UTILITIES_NAV: NavItem[] = [
  { to: '/logbook', labelKey: 'nav:logbook', icon: Notebook, colorClass: 'text-nav-logbook' },
  trashNav,
];
import { useUiInteractionStore } from '@taskora/api';
import { useProjectsQuery } from '@taskora/api';
import { useAreasQuery } from '@taskora/api';
import { useTagsQuery } from '@taskora/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NavRow = ({ item, count }: { item: NavItem; count?: number }) => {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => sidebarRowClass(isActive)}
    >
      <Icon className={cn('h-4 w-4 shrink-0', item.colorClass)} />
      <span className="truncate">{t(item.labelKey)}</span>
      {count !== undefined && count > 0 && (
        <span className="ml-auto pl-1 text-meta font-normal tabular-nums text-muted-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
};

function CollapsibleSection({
  labelKey,
  emptyHintKey,
  emptyTitlePlaceholderKey,
  icon: Icon,
  to,
  items,
}: {
  labelKey: string;
  emptyHintKey: string;
  emptyTitlePlaceholderKey: string;
  icon: LucideIcon;
  to: string;
  items: { id: string; title: string; href: string }[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(true);
  const label = t(labelKey);
  return (
    <div className="flex flex-col gap-px">
      <div className="group/section relative flex items-center">
        <NavLink to={to} className={({ isActive }) => sidebarRowClass(isActive, 'flex-1')}>
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? t('nav:collapse', { label }) : t('nav:expand', { label })}
          className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent focus-visible:opacity-100 group-hover/section:opacity-100 max-md:opacity-100"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-px pl-6">
          {items.length === 0 ? (
            <span className="px-2 py-1 text-meta text-muted-foreground">{t(emptyHintKey)}</span>
          ) : (
            items.map((item) => (
              <NavLink
                key={item.id}
                to={item.href}
                className={({ isActive }) => sidebarRowClass(isActive)}
              >
                <span className="truncate">{item.title || t(emptyTitlePlaceholderKey)}</span>
              </NavLink>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const { data: allProjects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { data: tags = [] } = useTagsQuery();
  const { inboxCount, todayCount } = useBucketCounts();
  const countByRoute: Record<string, number> = {
    '/inbox': inboxCount,
    '/today': todayCount,
  };

  // 侧边栏仅展示 ACTIVE 项目，已完成项目不参与侧边栏导航树
  const projects = allProjects.filter((p) => p.status !== ProjectStatus.COMPLETED);

  return (
    <aside className="flex h-screen w-60 flex-col bg-sidebar">
      <div className="px-2 pb-2 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-semibold hover:bg-sidebar-accent/60"
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
        {/* 助手：顶部独立分组 */}
        <div className="flex flex-col gap-px">
          {SIDEBAR_ASSISTANT_NAV.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-px">
          {SIDEBAR_MAIN_NAV.map((item) => (
            <NavRow key={item.to} item={item} count={countByRoute[item.to]} />
          ))}
        </div>

        {/* 日志 / 废纸篓 */}
        <div className="mt-4 flex flex-col gap-px">
          {SIDEBAR_UTILITIES_NAV.map((item) => (
            <NavRow key={item.to} item={item} />
          ))}
        </div>

        <div className="mt-4 flex flex-col">
          <SidebarProjectSection projects={projects} areas={areas} />
        </div>

        <div className="mb-3 mt-4 flex flex-col">
          <CollapsibleSection
            labelKey="nav:tags"
            icon={TagsIcon}
            to="/tags"
            emptyHintKey="nav:emptyTags"
            emptyTitlePlaceholderKey="tag:new"
            items={tags.map((t) => ({ id: t.id, title: t.title, href: `/tags/${t.id}` }))}
          />
        </div>
      </ScrollArea>

      <SidebarBottomBar />
    </aside>
  );
}
