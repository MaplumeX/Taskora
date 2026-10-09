import { ResizableSidebar } from './ResizableSidebar';
import { MainContent } from './MainContent';
import { ContentBottomBar } from '@/components/layout/ContentBottomBar';
import { KeyboardShortcuts } from '@/components/keyboard/KeyboardShortcuts';
import { MobileTopBar } from '@/components/layout/MobileTopBar';
import { MobileFab } from '@/components/layout/MobileFab';
import { MultiSelectToolbar } from '@/components/task/MultiSelectToolbar';
import { ExpandedTaskToolbar } from '@/components/task/ExpandedTaskToolbar';
import { LazyAssistantPanel, LazySettingsModal } from './LazyShellFeatures';
import { SyncIndicator } from './SyncIndicator';
import { SidebarDropProvider } from './SidebarDropProvider';
import { useSidebarYieldsToPanel } from '@/components/agent/assistant-panel-layout';
import { useNavigationRequestListener, useTaskRevealListener } from '@taskora/api';
import { useNavigationPreloadIntent } from '../../lib/navigation-preload';

export function AppShell() {
  const preloadIntent = useNavigationPreloadIntent();
  // Reveal Task：平台壳（点通知）投递的定位请求在这里执行（需在 Router 内）。
  useTaskRevealListener();
  // 路由请求：平台壳（点状态栏通知）投递的导航请求同样在 Router 内执行。
  useNavigationRequestListener();
  // 助手面板打开而窗口放不下三栏时，侧边栏先自动收起（关面板即恢复）。
  useSidebarYieldsToPanel();
  // h-[calc(100dvh-var(--kb-inset,0px))]：Android 键盘避让（mobile 壳的
  // visualViewport 驱动，其余端未设置 → 0px，等价 h-dvh）。
  // 手机端主列顶部让出状态栏（edge-to-edge 下内容铺到系统栏后面）。
  // 侧边栏与内容区共用一个拖拽上下文（ADR 0018）：任务 / 项目行可拖到侧边栏。
  return (
    <SidebarDropProvider>
      <div {...preloadIntent} className="flex h-[calc(100dvh-var(--kb-inset,0px))] w-full">
        {/* 桌面侧边栏（手机端隐藏）：右缘可拖动调宽 / 拖到折叠 */}
        <ResizableSidebar />
        <div className="flex h-[calc(100dvh-var(--kb-inset,0px))] min-w-0 flex-1 flex-col max-md:pt-[var(--safe-area-top)]">
          <MobileTopBar />
          <MainContent />
          <ContentBottomBar />
        </div>
        {/* 桌面右侧助手面板：始终与内容并排，不浮在内容上 */}
        <LazyAssistantPanel />
        <MobileFab />
        {/* 触控多选模式（左滑任务行进入）的底部工具栏，模式中替代 FAB。 */}
        <MultiSelectToolbar />
        {/* 任务展开时替代 FAB 的「移动 / 删除 / 更多」（桌面版在 ContentBottomBar 内）。 */}
        <ExpandedTaskToolbar variant="floating" />
        <LazySettingsModal />
        <KeyboardShortcuts />
        {/* 同步指示器（V2）：仅在离线 / 需要升级时出现在角落，不拦操作 */}
        <SyncIndicator />
      </div>
    </SidebarDropProvider>
  );
}
