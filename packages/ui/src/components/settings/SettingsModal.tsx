import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { SunMedium, User, Download, Info, Bot, SlidersHorizontal, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiInteractionStore, type SettingsTab } from '@taskora/api';

const SettingsAppearance = lazy(() => import('@/components/settings/SettingsAppearance'));
const SettingsGeneral = lazy(() => import('@/components/settings/SettingsGeneral'));
const SettingsAccount = lazy(() => import('@/components/settings/SettingsAccount'));
const SettingsData = lazy(() => import('@/components/settings/SettingsData'));
const SettingsAbout = lazy(() => import('@/components/settings/SettingsAbout'));
const SettingsAssistant = lazy(() => import('@/components/settings/SettingsAssistant'));

interface SettingsNavItem {
  tab: SettingsTab;
  labelKey: string;
  icon: LucideIcon;
}

const settingsNav: SettingsNavItem[] = [
  { tab: 'general', labelKey: 'settings:general', icon: SlidersHorizontal },
  { tab: 'appearance', labelKey: 'settings:appearance', icon: SunMedium },
  { tab: 'account', labelKey: 'settings:account', icon: User },
  { tab: 'data', labelKey: 'settings:data', icon: Download },
  { tab: 'assistant', labelKey: 'settings:assistant', icon: Bot },
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
      case 'general':
        return <SettingsGeneral />;
      case 'appearance':
        return <SettingsAppearance />;
      case 'account':
        return <SettingsAccount />;
      case 'data':
        return <SettingsData />;
      case 'assistant':
        return <SettingsAssistant />;
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

        <div className="flex flex-col gap-4 overflow-hidden md:flex-row md:gap-6">
          {/* 导航：手机端为顶部水平标签行，桌面端为左侧导航列 */}
          <nav className="shrink-0 md:w-40">
            <ul
              className="flex gap-1 overflow-x-auto md:flex-col"
            >
              {settingsNav.map((item) => {
                const Icon = item.icon;
                const active = item.tab === settingsTab;
                return (
                  <li key={item.tab} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSettingsTab(item.tab)}
                      className={cn(
                        'flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
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

          {/* 内容区：手机端跟随弹窗高度滚动 */}
          <ScrollArea key={settingsTab} className="h-[70vh] min-w-0 flex-1 max-md:h-[60dvh]">
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