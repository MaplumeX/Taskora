import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@taskora/ui/components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';
import { PullToRefresh } from './components/PullToRefresh';
import { requestPullSync } from './engine/mobile-engine';

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

const AgentPage = lazy(() => import('@taskora/ui/pages/Agent'));
const Anytime = lazy(() => import('@taskora/ui/pages/Anytime'));
const AreaDetail = lazy(() => import('@taskora/ui/pages/AreaDetail'));
const Calendar = lazy(() => import('@taskora/ui/pages/Calendar'));
const Inbox = lazy(() => import('@taskora/ui/pages/Inbox'));
const Logbook = lazy(() => import('@taskora/ui/pages/Logbook'));
const ProjectDetail = lazy(() => import('@taskora/ui/pages/ProjectDetail'));
const Someday = lazy(() => import('@taskora/ui/pages/Someday'));
const TagDetail = lazy(() => import('@taskora/ui/pages/TagDetail'));
const Tags = lazy(() => import('@taskora/ui/pages/Tags'));
const Today = lazy(() => import('@taskora/ui/pages/Today'));
const Trash = lazy(() => import('@taskora/ui/pages/Trash'));
const Upcoming = lazy(() => import('@taskora/ui/pages/Upcoming'));

/**
 * Android 主界面：与 desktop 的 MainApp 同构（同一 URL 形状，共享 hooks
 * 全部可用），差异：
 * - BrowserRouter（而非 MemoryRouter）：返回手势级联依赖真实浏览器
 *   历史（`window.history.state.idx`，见 back-navigation.ts）。单窗口
 *   壳不存在 desktop 的 quick-add 双窗口问题。
 * - PullToRefresh 包裹内容区：下拉刷新手动触发同步（issue 04）。
 */
export function MainApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <PullToRefresh onRefresh={() => requestPullSync()}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/today" replace />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/today" element={<Today />} />
                <Route path="/upcoming" element={<Upcoming />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/anytime" element={<Anytime />} />
                <Route path="/someday" element={<Someday />} />
                <Route path="/logbook" element={<Logbook />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/areas/:id" element={<AreaDetail />} />
                <Route path="/tags" element={<Tags />} />
                <Route path="/tags/:tagId" element={<TagDetail />} />
                <Route path="/trash" element={<Trash />} />
                <Route path="/agent" element={<AgentPage />} />
                <Route path="*" element={<Navigate to="/today" replace />} />
              </Route>
            </Route>
          </Routes>
        </PullToRefresh>
      </Suspense>
    </BrowserRouter>
  );
}
