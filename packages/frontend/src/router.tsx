import { Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@taskora/ui/components/layout/AppShell';
import { RootRedirect } from '@taskora/ui/components/layout/RootRedirect';
import { ProtectedRoute } from './components/ProtectedRoute';
// lazyWithRetry：部署后旧 chunk 被删除时自动刷新拉新入口，而不是把
// `Failed to fetch dynamically imported module` 暴露给用户。
import { lazyWithRetry } from './lib/lazyWithRetry';

function PageFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

const AgentPage = lazyWithRetry(() => import('@taskora/ui/pages/Agent'));
const Anytime = lazyWithRetry(() => import('@taskora/ui/pages/Anytime'));
const AreaDetail = lazyWithRetry(() => import('@taskora/ui/pages/AreaDetail'));
const Calendar = lazyWithRetry(() => import('@taskora/ui/pages/Calendar'));
const Home = lazyWithRetry(() => import('@taskora/ui/pages/Home'));
const Inbox = lazyWithRetry(() => import('@taskora/ui/pages/Inbox'));
const Logbook = lazyWithRetry(() => import('@taskora/ui/pages/Logbook'));
const Login = lazyWithRetry(() => import('@/pages/Login'));
const ProjectDetail = lazyWithRetry(() => import('@taskora/ui/pages/ProjectDetail'));
const Register = lazyWithRetry(() => import('@/pages/Register'));
const Search = lazyWithRetry(() => import('@taskora/ui/pages/Search'));
const Someday = lazyWithRetry(() => import('@taskora/ui/pages/Someday'));
const LaterProjects = lazyWithRetry(() => import('@taskora/ui/pages/LaterProjects'));
const TagDetail = lazyWithRetry(() => import('@taskora/ui/pages/TagDetail'));
const Tags = lazyWithRetry(() => import('@taskora/ui/pages/Tags'));
const Today = lazyWithRetry(() => import('@taskora/ui/pages/Today'));
const Trash = lazyWithRetry(() => import('@taskora/ui/pages/Trash'));
const Upcoming = lazyWithRetry(() => import('@taskora/ui/pages/Upcoming'));

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
        element: <AppShell />,
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
