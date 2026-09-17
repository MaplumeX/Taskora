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

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full noise-overlay">
      {/* 桌面侧边栏（手机端隐藏） */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <MainContent />
        <ContentBottomBar />
      </div>
      <MobileTabBar onOpenDrawer={() => setDrawerOpen(true)} />
      <MobileNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      <MobileFab />
      <SettingsModal />
      <KeyboardShortcuts />
    </div>
  );
}
