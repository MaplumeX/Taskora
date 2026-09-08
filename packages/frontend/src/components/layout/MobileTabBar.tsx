import { NavLink, useLocation } from 'react-router-dom';
import { Calendar, Circle, Menu, Sun, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/** 底部标签栏中直接展示的 4 个主导航项 */
const TAB_ITEMS = [
  { to: '/today', labelKey: 'nav:today', icon: Sun },
  { to: '/inbox', labelKey: 'nav:inbox', icon: Inbox },
  { to: '/calendar', labelKey: 'nav:calendar', icon: Calendar },
  { to: '/anytime', labelKey: 'nav:anytime', icon: Circle },
];

/** 「更多」抽屉收纳的入口路由前缀，「更多」标签在这些路由下高亮 */
const DRAWER_ROUTE_PREFIXES = [
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

export function MobileTabBar({ onOpenDrawer }: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // 「更多」在当前路由属于抽屉内入口时高亮
  const drawerActive = DRAWER_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));

  return (
    <nav
      aria-label={t('nav:mainNavigation')}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
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
                <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
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
