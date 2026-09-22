import { NavLink, useLocation } from 'react-router-dom';
import { Calendar, Circle, Menu, Sun, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { useBucketCounts } from './useBucketCounts';

/** 底部标签栏中直接展示的 4 个主导航项 */
const TAB_ITEMS = [
  { to: '/today', labelKey: 'nav:today', icon: Sun },
  { to: '/inbox', labelKey: 'nav:inbox', icon: Inbox },
  { to: '/calendar', labelKey: 'nav:calendar', icon: Calendar },
  { to: '/anytime', labelKey: 'nav:anytime', icon: Circle },
];

/** 「更多」抽屉收纳的入口路由前缀，「更多」标签在这些路由下高亮 */
const DRAWER_ROUTE_PREFIXES = [
  '/agent',
  '/upcoming',
  '/someday',
  '/logbook',
  '/tags',
  '/trash',
  '/projects',
  '/areas',
];

interface Props {
  onOpenDrawer: () => void;
}

/** 图标右上角的条目数角标；数字不参与链接的可访问名称 */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      aria-hidden
      data-testid="tab-count-badge"
      className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none tabular-nums text-primary-foreground"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function MobileTabBar({ onOpenDrawer }: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { inboxCount, todayCount } = useBucketCounts();
  // 「更多」在当前路由属于抽屉内入口时高亮
  const drawerActive = DRAWER_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
  const countByRoute: Record<string, number> = {
    '/inbox': inboxCount,
    '/today': todayCount,
  };

  return (
    <nav
      aria-label={t('nav:mainNavigation')}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur-sm md:hidden"
      style={{
        bottom: 'var(--kb-inset, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TAB_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex min-h-[56px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground transition-colors active:bg-accent/60',
                isActive && 'text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                  <CountBadge count={countByRoute[item.to] ?? 0} />
                </span>
                <span className="truncate">{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label={t('common:more')}
        className={cn(
          'flex min-h-[56px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground transition-colors active:bg-accent/60',
          drawerActive && 'text-foreground',
        )}
      >
        <Menu className={cn('h-5 w-5', drawerActive && 'text-primary')} />
        <span className="truncate">{t('common:more')}</span>
      </button>
    </nav>
  );
}
