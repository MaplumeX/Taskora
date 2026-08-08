import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { SunMedium, User, Download, Info, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiInteractionStore, type SettingsTab } from '@/lib/stores/uiInteraction.store';

const SettingsAppearance = lazy(() => import('@/pages/SettingsAppearance'));
const SettingsAccount = lazy(() => import('@/pages/SettingsAccount'));
const SettingsData = lazy(() => import('@/pages/SettingsData'));
const SettingsAbout = lazy(() => import('@/pages/SettingsAbout'));

interface SettingsNavItem {
  tab: SettingsTab;
  labelKey: string;
  icon: LucideIcon;
}

const settingsNav: SettingsNavItem[] = [
  { tab: 'appearance', labelKey: 'settings:appearance', icon: SunMedium },
  { tab: 'account', labelKey: 'settings:account', icon: User },
  { tab: 'data', labelKey: 'settings:data', icon: Download },
  { tab: 'about', labelKey: 'settings:about', icon: Info },
];

export function SettingsModal() {
  const { t } = useTranslation(['common', 'settings']);
  const settingsOpen = useUiInteractionStore((s) => s.settingsOpen);
  const settingsTab = useUiInteractionStore((s) => s.settingsTab);
  const closeSettings = useUiInteractionStore((s) => s.closeSettings);
  const setSettingsTab = useUiInteractionStore((s) => s.setSettingsTab);

  const renderContent = () => {
    switch (settingsTab) {
      case 'appearance':
        return <SettingsAppearance />;
      case 'account':
        return <SettingsAccount />;
      case 'data':
        return <SettingsData />;
      case 'about':
        return <SettingsAbout />;
    }
  };

  return (
    <Dialog open={settingsOpen} onOpenChange={(v) => { if (!v) closeSettings(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('common:settings')}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 overflow-hidden">
          {/* 左侧导航 */}
          <nav className="w-40 shrink-0">
            <ul className="flex flex-col gap-1">
              {settingsNav.map((item) => {
                const Icon = item.icon;
                const active = item.tab === settingsTab;
                return (
                  <li key={item.tab}>
                    <button
                      type="button"
                      onClick={() => setSettingsTab(item.tab)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {t(item.labelKey)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* 右侧内容区 */}
          <ScrollArea key={settingsTab} className="h-[70vh] min-w-0 flex-1">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
                </div>
              }
            >
              {renderContent()}
            </Suspense>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}