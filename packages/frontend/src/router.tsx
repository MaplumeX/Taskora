import { pageLoaders } from '@taskora/ui/lib/page-loaders';
import { NavigationPreloadProvider } from '@taskora/ui/lib/navigation-preload';
import { Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { RootRedirect } from '@taskora/ui/components/layout/RootRedirect';
import { ProtectedRoute } from './components/ProtectedRoute';
// lazyWithRetry：部署后旧 chunk 被删除时自动刷新拉新入口，而不是把
// `Failed to fetch dynamically imported module` 暴露给用户。
import { lazyWithRetry, loadWithRecovery } from './lib/lazyWithRetry';
import { setModuleLoadRecovery } from '@taskora/ui/lib/module-loader';

setModuleLoadRecovery(loadWithRecovery);

function PageFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

// 入口先恢复身份、准备本地引擎，壳与页面的 UI 依赖随后并行加载。
const AppShell = lazyWithRetry(() =>
  import('@taskora/ui/components/layout/AppShell').then((module) => ({ default: module.AppShell })),
);
const AgentPage = lazyWithRetry(pageLoaders.Agent);
const Anytime = lazyWithRetry(pageLoaders.Anytime);
const AreaDetail = lazyWithRetry(pageLoaders.AreaDetail);
const Calendar = lazyWithRetry(pageLoaders.Calendar);
const Home = lazyWithRetry(pageLoaders.Home);
const Inbox = lazyWithRetry(pageLoaders.Inbox);
const Logbook = lazyWithRetry(pageLoaders.Logbook);
const Review = lazyWithRetry(pageLoaders.Review);
const Login = lazyWithRetry(() => import('@/pages/Login'));
const ProjectDetail = lazyWithRetry(pageLoaders.ProjectDetail);
const Register = lazyWithRetry(() => import('@/pages/Register'));
const Search = lazyWithRetry(pageLoaders.Search);
const Someday = lazyWithRetry(pageLoaders.Someday);
const LaterProjects = lazyWithRetry(pageLoaders.LaterProjects);
const TagDetail = lazyWithRetry(pageLoaders.TagDetail);
const Tags = lazyWithRetry(pageLoaders.Tags);
const Today = lazyWithRetry(pageLoaders.Today);
const Trash = lazyWithRetry(pageLoaders.Trash);
const Upcoming = lazyWithRetry(pageLoaders.Upcoming);

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageFallback />}>
        <Login />
      </Suspense>
    ),
  },
  {
    path: '/register',
    element: (
      <Suspense fallback={<PageFallback />}>
        <Register />
      </Suspense>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: (
          <Suspense fallback={<PageFallback />}>
            <NavigationPreloadProvider platform="web">
              <AppShell />
            </NavigationPreloadProvider>
          </Suspense>
        ),
        children: [
          { index: true, path: '/', element: <RootRedirect /> },
          { path: '/home', element: <Home /> },
          { path: '/inbox', element: <Inbox /> },
          { path: '/today', element: <Today /> },
          { path: '/upcoming', element: <Upcoming /> },
          { path: '/calendar', element: <Calendar /> },
          { path: '/anytime', element: <Anytime /> },
          { path: '/someday', element: <Someday /> },
          { path: '/later-projects', element: <LaterProjects /> },
          { path: '/review/*', element: <Review /> },
          { path: '/logbook', element: <Logbook /> },
          { path: '/projects/:id', element: <ProjectDetail /> },
          { path: '/areas/:id', element: <AreaDetail /> },
          { path: '/tags', element: <Tags /> },
          { path: '/tags/:tagId', element: <TagDetail /> },
          { path: '/trash', element: <Trash /> },
          { path: '/search', element: <Search /> },
          { path: '/agent', element: <AgentPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
