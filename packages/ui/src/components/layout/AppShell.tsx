import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { ContentBottomBar } from '@/components/layout/ContentBottomBar';
import { KeyboardShortcuts } from '@/components/keyboard/KeyboardShortcuts';
import { MobileTopBar } from '@/components/layout/MobileTopBar';
import { MobileFab } from '@/components/layout/MobileFab';
import { MultiSelectToolbar } from '@/components/task/MultiSelectToolbar';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { SyncIndicator } from './SyncIndicator';
import { AssistantPanel } from '@/components/agent/AssistantPanel';
import { useNavigationRequestListener, useTaskRevealListener } from '@taskora/api';

export function AppShell() {
  // Reveal Task：平台壳（点通知）投递的定位请求在这里执行（需在 Router 内）。
  useTaskRevealListener();
  // 路由请求：平台壳（点状态栏通知）投递的导航请求同样在 Router 内执行。
  useNavigationRequestListener();
  // h-[calc(100dvh-var(--kb-inset,0px))]：Android 键盘避让（mobile 壳的
  // visualViewport 驱动，其余端未设置 → 0px，等价 h-dvh）。
  // 手机端主列顶部让出状态栏（edge-to-edge 下内容铺到系统栏后面）。
  return (
    <div className="flex h-[calc(100dvh-var(--kb-inset,0px))] w-full">
      {/* 桌面侧边栏（手机端隐藏） */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex h-[calc(100dvh-var(--kb-inset,0px))] min-w-0 flex-1 flex-col max-md:pt-[var(--safe-area-top)]">
        <MobileTopBar />
        <MainContent />
        <ContentBottomBar />
      </div>
      {/* 桌面右侧助手面板：宽屏与列表并排，窄屏 / 日历覆盖在内容上 */}
      <AssistantPanel />
      <MobileFab />
      {/* 触控多选模式（左滑任务行进入）的底部工具栏，模式中替代 FAB。 */}
      <MultiSelectToolbar />
      <SettingsModal />
      <KeyboardShortcuts />
      {/* 同步指示器（V2）：仅在离线 / 需要升级时出现在角落，不拦操作 */}
      <SyncIndicator />
    </div>
  );
}
