import { useState } from 'react';

import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { ContentBottomBar } from '@/components/layout/ContentBottomBar';
import { KeyboardShortcuts } from '@/components/keyboard/KeyboardShortcuts';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer';
import { MobileTopBar } from '@/components/layout/MobileTopBar';
import { MobileFab } from '@/components/layout/MobileFab';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { SyncIndicator } from './SyncIndicator';

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // h-[calc(100dvh-var(--kb-inset,0px))]：Android 键盘避让（mobile 壳的
  // visualViewport 驱动，其余端未设置 → 0px，等价 h-dvh）。
  return (
    <div className="flex h-[calc(100dvh-var(--kb-inset,0px))] w-full noise-overlay">
      {/* 桌面侧边栏（手机端隐藏） */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex h-[calc(100dvh-var(--kb-inset,0px))] min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <MainContent />
        <ContentBottomBar />
      </div>
      <MobileTabBar onOpenDrawer={() => setDrawerOpen(true)} />
      <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      <MobileFab />
      <SettingsModal />
      <KeyboardShortcuts />
      {/* 同步指示器（V2）：仅桌面端有 Engine 时渲染，常驻角落不拦操作 */}
      <SyncIndicator />
    </div>
  );
}
