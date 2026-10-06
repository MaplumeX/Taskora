import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, Download, Info, SlidersHorizontal, SunMedium } from 'lucide-react';

import { DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  getAppVersion,
  useAgentConfig,
  useAuthStore,
  usePreferencesStore,
  useUiInteractionStore,
  type SettingsTab,
} from '@taskora/api';

import {
  SettingsGroup,
  SettingsIcon,
  SettingsNavProvider,
  SettingsPage,
  SettingsRow,
  type SettingsPageEntry,
} from './SettingsList';

const SettingsAppearance = lazy(() => import('@/components/settings/SettingsAppearance'));
const SettingsShortcuts = lazy(() => import('@/components/settings/SettingsShortcuts'));
const SettingsGeneral = lazy(() => import('@/components/settings/SettingsGeneral'));
const SettingsAccount = lazy(() => import('@/components/settings/SettingsAccount'));
const SettingsData = lazy(() => import('@/components/settings/SettingsData'));
const SettingsAbout = lazy(() => import('@/components/settings/SettingsAbout'));
const SettingsAssistant = lazy(() => import('@/components/settings/SettingsAssistant'));

const TAB_TITLE_KEY: Record<SettingsTab, string> = {
  general: 'settings:general',
  appearance: 'settings:appearance',
  shortcuts: 'settings:shortcuts',
  account: 'settings:account',
  data: 'settings:data',
  assistant: 'settings:assistant',
  about: 'settings:about',
};

function renderTab(tab: SettingsTab): ReactNode {
  switch (tab) {
    case 'general':
      return <SettingsGeneral />;
    case 'appearance':
      return <SettingsAppearance />;
    case 'shortcuts':
      return <SettingsShortcuts />;
    case 'account':
      return <SettingsAccount />;
    case 'data':
      return <SettingsData />;
    case 'assistant':
      return <SettingsAssistant />;
    case 'about':
      return <SettingsAbout />;
  }
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

/** 设置首页：账户卡片 + 分类分组列表，每行显示当前值。 */
function SettingsRoot({ open }: { open: (tab: SettingsTab) => void }) {
  const { t } = useTranslation(['settings', 'theme', 'common']);
  const user = useAuthStore((s) => s.user);
  const theme = usePreferencesStore((s) => s.theme);
  const { data: agentConfig } = useAgentConfig();

  const name = user?.displayName || user?.email || t('common:notLoggedIn');
  const initial = (user?.displayName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase();

  return (
    <SettingsPage>
      <SettingsGroup>
        <SettingsRow
          onClick={() => open('account')}
          leading={
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-lg font-medium text-primary-foreground">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-12 w-12 object-cover" />
              ) : (
                initial
              )}
            </span>
          }
          label={<span className="text-lg font-medium">{name}</span>}
          description={user?.displayName ? user.email : t('settings:account')}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          onClick={() => open('general')}
          leading={<SettingsIcon icon={SlidersHorizontal} />}
          label={t('settings:general')}
        />
        <SettingsRow
          onClick={() => open('appearance')}
          leading={<SettingsIcon icon={SunMedium} />}
          label={t('settings:appearance')}
          value={t(`theme:${theme}`)}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          onClick={() => open('assistant')}
          leading={<SettingsIcon icon={Bot} />}
          label={t('settings:assistant')}
          value={
            agentConfig
              ? agentConfig.configured
                ? t('settings:assistantConfigured')
                : t('settings:assistantNotConfigured')
              : undefined
          }
        />
        <SettingsRow
          onClick={() => open('data')}
          leading={<SettingsIcon icon={Download} />}
          label={t('settings:data')}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          onClick={() => open('about')}
          leading={<SettingsIcon icon={Info} />}
          label={t('settings:about')}
          value={getAppVersion()}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

/**
 * 窄屏设置（iOS 设置 / Android 系统设置惯例）：分类首页 → 推入详情页 →
 * 推入选项页的页面栈。系统返回 / Escape 逐级后退，在首页才关闭设置。
 * 设置页经 SettingsNavProvider 感知自己处于栈内，渲染列表单元格形态。
 */
export function MobileSettingsContent() {
  const { t } = useTranslation(['common', 'settings']);
  const settingsOpen = useUiInteractionStore((s) => s.settingsOpen);
  const entryTab = useUiInteractionStore((s) => s.settingsEntryTab);
  const closeSettings = useUiInteractionStore((s) => s.closeSettings);

  const [stack, setStack] = useState<SettingsPageEntry[]>([]);
  // 仅入栈时播放推入动画（出栈直接显示上一页）。
  const pushedRef = useRef(false);

  const tabEntry = (tab: SettingsTab): SettingsPageEntry => ({
    title: t(TAB_TITLE_KEY[tab]),
    render: () => renderTab(tab),
  });

  // 每次打开从首页开始；显式指定分类（如助手页「去配置」）则直接推入该分类。
  useEffect(() => {
    if (!settingsOpen) return;
    pushedRef.current = false;
    setStack(entryTab ? [tabEntry(entryTab)] : []);
    // 仅随打开 / 入口变化重置（tabEntry 每次渲染新建，不入依赖）。
  }, [settingsOpen, entryTab]);

  const nav = {
    push: (entry: SettingsPageEntry) => {
      pushedRef.current = true;
      setStack((s) => [...s, entry]);
    },
    pop: () => {
      pushedRef.current = false;
      setStack((s) => s.slice(0, -1));
    },
  };

  const current = stack[stack.length - 1];
  const title = current?.title ?? t('common:settings');

  return (
    <DialogContent
      mobileFullscreen
      hideClose
      aria-describedby={undefined}
      onOpenAutoFocus={(e) => e.preventDefault()}
      // 返回手势（经 back-navigation 转为 Escape）/ Escape：有上一级先出栈。
      onEscapeKeyDown={(e) => {
        if (stack.length === 0) return;
        e.preventDefault();
        nav.pop();
      }}
      className="h-[calc(100dvh-var(--kb-inset,0px))] bg-muted pt-[var(--safe-area-top)] dark:bg-background"
    >
      {/* 顶栏（Material small top app bar）：左侧 ← 返回（首页即关闭设置）、标题靠左，
          无「完成」按钮——Android 靠返回键 / 返回手势离开。 */}
      <header className="flex h-16 shrink-0 items-center gap-1 px-1">
        <button
          type="button"
          onClick={stack.length > 0 ? nav.pop : closeSettings}
          aria-label={stack.length > 0 ? t('common:back') : t('common:close')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-foreground active:bg-accent"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <DialogTitle className="min-w-0 truncate text-xl font-normal">{title}</DialogTitle>
      </header>

      {/*
       * 栈内各页保持挂载、仅显示最顶层：上一级的表单状态（如助手页未保存
       * 的输入）与滚动位置在返回后保留，选项页回调也仍作用于已挂载的父页。
       */}
      <SettingsNavProvider value={nav}>
        {[null, ...stack].map((entry, depth) => {
          const top = depth === stack.length;
          return (
            <div
              key={depth}
              hidden={!top}
              className={cn(
                'min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+var(--safe-area-bottom))] pt-4',
                top &&
                  depth > 0 &&
                  pushedRef.current &&
                  'duration-base animate-in fade-in-0 slide-in-from-right-8',
              )}
            >
              <Suspense fallback={<PageFallback />}>
                {entry ? (
                  entry.render()
                ) : (
                  <SettingsRoot open={(tab) => nav.push(tabEntry(tab))} />
                )}
              </Suspense>
            </div>
          );
        })}
      </SettingsNavProvider>
    </DialogContent>
  );
}
