import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Bot,
  Search,
  Settings,
  Tags as TagsIcon,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import {
  useAreasQuery,
  useHasNewInToday,
  useProjectsQuery,
  useUiInteractionStore,
} from '@taskora/api';

import { Button } from '@/components/ui/button';
import { QuickFind } from '@/components/search/QuickFind';
import { SidebarProjectSection } from '@/components/layout/SidebarProjectSection';
import { AppDndProvider } from '../lib/appDnd';
import { mainNav, type NavItem } from '@/components/layout/navItems';
import { useBucketCounts } from '@/components/layout/useBucketCounts';
import { NewInTodayDot } from '@/components/task/NewInTodayDot';
import { useIsDesktop } from '../lib/use-media-query';
import { cn } from '@/lib/utils';

/** 首页列表分组（Things 3 iOS）：收件箱单独一组，时间视图一组，回顾/删除一组。 */
const NAV_GROUPS: string[][] = [
  ['/inbox'],
  ['/today', '/upcoming', '/calendar', '/anytime', '/someday'],
  ['/logbook'],
];

const ROW_CLASS =
  'flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors active:bg-accent';

function navItemFor(to: string): NavItem {
  const item = mainNav.find((n) => n.to === to);
  if (!item) throw new Error(`unknown nav item ${to}`);
  return item;
}

function HomeRow({
  to,
  icon: Icon,
  iconClassName,
  label,
  count,
  hasNew = false,
}: {
  to: string;
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  count?: number;
  /** Today 有尚未看过的新到条目：计数旁带黄点（New in Today）。 */
  hasNew?: boolean;
}) {
  return (
    <Link to={to} className={ROW_CLASS}>
      <Icon className={cn('h-5 w-5 shrink-0', iconClassName)} />
      <span className="flex-1 truncate">{label}</span>
      {hasNew && (
        <span className="relative h-1.5 w-1.5 shrink-0">
          <NewInTodayDot className="left-1/2" />
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span aria-hidden className="text-sm tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}

function HomeGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

/**
 * 手机端首页（Things 3 iOS 的主列表）：窄屏的唯一导航枢纽，替代
 * 底部标签栏与「更多」抽屉。各列表以 push 方式进入，顶栏返回回到这里。
 * 桌面宽度有常驻侧边栏，不需要本页 → 直接落到 Today。
 */
export default function Home() {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const openSettings = useUiInteractionStore((s) => s.openSettings);
  const { inboxCount, todayCount } = useBucketCounts();
  const hasNewInToday = useHasNewInToday();
  const { data: allProjects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const [searchOpen, setSearchOpen] = useState(false);

  if (isDesktop) return <Navigate to="/today" replace />;
  const countByRoute: Record<string, number> = {
    '/inbox': inboxCount,
    '/today': todayCount,
  };

  return (
    <div className="flex flex-col gap-5 pb-4 pt-3">
      {/* 顶部：快速查找（点开搜索弹层）+ 助手入口 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-muted/70 px-3 text-left text-[15px] text-muted-foreground"
        >
          <Search className="h-4 w-4" />
          {t('search:title')}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={t('nav:assistant')}
          onClick={() => navigate('/agent')}
        >
          <Bot className="h-5 w-5" />
        </Button>
      </div>
      <QuickFind open={searchOpen} onOpenChange={setSearchOpen} />

      {NAV_GROUPS.map((group) => (
        <HomeGroup key={group[0]}>
          {group.map((to) => {
            const item = navItemFor(to);
            return (
              <HomeRow
                key={to}
                to={to}
                icon={item.icon}
                iconClassName={item.colorClass}
                label={t(item.labelKey)}
                count={countByRoute[to]}
                hasNew={to === '/today' && hasNewInToday}
              />
            );
          })}
          {group.includes('/logbook') && (
            <HomeRow
              to="/trash"
              icon={Trash2}
              iconClassName="text-muted-foreground"
              label={t('nav:trash')}
            />
          )}
        </HomeGroup>
      ))}

      {/* 区域 / 项目：与桌面侧边栏同一组件（含长按拖拽排序）。隐藏的桌面侧边栏
          同样挂着这些项目 / 区域，拖拽 id 相同，因此用独立的拖拽上下文隔开。 */}
      <AppDndProvider>
        <SidebarProjectSection projects={allProjects} areas={areas} />
      </AppDndProvider>

      <HomeGroup>
        <HomeRow
          to="/tags"
          icon={TagsIcon}
          iconClassName="text-muted-foreground"
          label={t('nav:tags')}
        />
      </HomeGroup>

      {/* 设置（登出在 设置 › 账户 内） */}
      <div className="border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-11 gap-2 text-muted-foreground"
          onClick={() => openSettings()}
        >
          <Settings className="h-4 w-4" />
          {t('common:settings')}
        </Button>
      </div>
    </div>
  );
}
