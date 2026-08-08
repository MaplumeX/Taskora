import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SunMedium, User, Download, Info, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface SettingsNavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const settingsNav: SettingsNavItem[] = [
  { to: '/settings/appearance', labelKey: 'settings:appearance', icon: SunMedium },
  { to: '/settings/account', labelKey: 'settings:account', icon: User },
  { to: '/settings/data', labelKey: 'settings:data', icon: Download },
  { to: '/settings/about', labelKey: 'settings:about', icon: Info },
];

export default function SettingsLayout() {
  const { t } = useTranslation(['common', 'settings']);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {t('common:settings')}
      </h1>

      <div className="flex gap-8">
        {/* 左侧导航 */}
        <nav className="w-44 shrink-0">
          <ul className="flex flex-col gap-1">
            {settingsNav.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(item.labelKey)}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 右侧内容 */}
        <div className="min-w-0 flex-1">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}