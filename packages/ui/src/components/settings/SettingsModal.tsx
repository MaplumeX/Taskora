import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { SunMedium, User, Download, Info, Bot, SlidersHorizontal, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsDesktop } from '../../lib/use-media-query';
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

function SettingsFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

export function SettingsModal() {
  const { t } = useTranslation(['common', 'settings']);
  const settingsOpen = useUiInteractionStore((s) => s.settingsOpen);
  const settingsTab = useUiInteractionStore((s) => s.settingsTab);
  const closeSettings = useUiInteractionStore((s) => s.closeSettings);
  const setSettingsTab = useUiInteractionStore((s) => s.setSettingsTab);
  const isDesktop = useIsDesktop();

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
      {isDesktop ? (
        /* ── 桌面端：居中弹窗，左侧导航列 ── */
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('common:settings')}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-6 overflow-hidden">
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

            <ScrollArea key={settingsTab} className="h-[70vh] min-w-0 flex-1">
              <Suspense fallback={<SettingsFallback />}>{renderContent()}</Suspense>
            </ScrollArea>
          </div>
        </DialogContent>
      ) : (
        /*
         * ── 移动端：全屏设置页 ──
         *
         * mobileFullscreen 变体去掉居中 transform（fixed 的 containing block
         * 由最近 transform 祖先决定，不去掉会被拉进弹窗盒），内容铺满视口。
         * 高度随 --kb-inset 收缩（mobile 壳 visualViewport 驱动，web 恒 0），
         * 键盘弹出时聚焦的输入框滚回可视区；pt/pb 避开刘海与 home 指示条。
         */
        <DialogContent
          mobileFullscreen
          className="h-[calc(100dvh-var(--kb-inset,0px))] pt-[env(safe-area-inset-top)]"
        >
          {/* 标题栏：关闭按钮（右上角 X）与标题同排 */}
          <div className="flex h-12 shrink-0 items-center border-b border-border/50 pl-4 pr-14">
            <h2 className="text-base font-semibold">{t('common:settings')}</h2>
          </div>

          {/* 导航：顶部水平标签行 */}
          <nav className="shrink-0 border-b border-border/50">
            <ul className="flex gap-1 overflow-x-auto px-2 py-1.5">
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

          {/* 内容：随面板高度滚动，底部避开 home 指示条 */}
          <ScrollArea key={settingsTab} className="min-h-0 flex-1">
            <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
              <Suspense fallback={<SettingsFallback />}>{renderContent()}</Suspense>
            </div>
          </ScrollArea>
        </DialogContent>
      )}
    </Dialog>
  );
}
