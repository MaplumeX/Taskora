import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { ContentBottomBar } from '@/components/layout/ContentBottomBar';
import { KeyboardShortcuts } from '@/components/keyboard/KeyboardShortcuts';
import { MobileTopBar } from '@/components/layout/MobileTopBar';
import { MobileFab } from '@/components/layout/MobileFab';
import { MultiSelectToolbar } from '@/components/task/MultiSelectToolbar';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { SyncIndicator } from './SyncIndicator';
import { useTaskRevealListener } from '@taskora/api';

export function AppShell() {
  // Reveal Task：平台壳（点通知）投递的定位请求在这里执行（需在 Router 内）。
  useTaskRevealListener();
  // h-[calc(100dvh-var(--kb-inset,0px))]：Android 键盘避让（mobile 壳的
  // visualViewport 驱动，其余端未设置 → 0px，等价 h-dvh）。
  return (
    <div className="flex h-[calc(100dvh-var(--kb-inset,0px))] w-full">
      {/* 桌面侧边栏（手机端隐藏） */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex h-[calc(100dvh-var(--kb-inset,0px))] min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <MainContent />
        <ContentBottomBar />
      </div>
      <MobileFab />
      {/* 触控多选模式（左滑任务行进入）的底部工具栏，模式中替代 FAB。 */}
      <MultiSelectToolbar />
      <SettingsModal />
      <KeyboardShortcuts />
      {/* 同步指示器（V2）：仅桌面端有 Engine 时渲染，常驻角落不拦操作 */}
      <SyncIndicator />
    </div>
  );
}
