import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@taskora/ui/components/layout/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';

function PageFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

const Anytime = lazy(() => import('@taskora/ui/pages/Anytime'));
const AreaDetail = lazy(() => import('@taskora/ui/pages/AreaDetail'));
const Calendar = lazy(() => import('@taskora/ui/pages/Calendar'));
const Inbox = lazy(() => import('@taskora/ui/pages/Inbox'));
const Logbook = lazy(() => import('@taskora/ui/pages/Logbook'));
const Login = lazy(() => import('@/pages/Login'));
const ProjectDetail = lazy(() => import('@taskora/ui/pages/ProjectDetail'));
const Register = lazy(() => import('@/pages/Register'));
const Someday = lazy(() => import('@taskora/ui/pages/Someday'));
const TagDetail = lazy(() => import('@taskora/ui/pages/TagDetail'));
const Tags = lazy(() => import('@taskora/ui/pages/Tags'));
const Today = lazy(() => import('@taskora/ui/pages/Today'));
const Trash = lazy(() => import('@taskora/ui/pages/Trash'));
const Upcoming = lazy(() => import('@taskora/ui/pages/Upcoming'));

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
          { index: true, path: '/', element: <Navigate to="/today" replace /> },
          { path: '/inbox', element: <Inbox /> },
          { path: '/today', element: <Today /> },
          { path: '/upcoming', element: <Upcoming /> },
          { path: '/calendar', element: <Calendar /> },
          { path: '/anytime', element: <Anytime /> },
          { path: '/someday', element: <Someday /> },
          { path: '/logbook', element: <Logbook /> },
          { path: '/projects/:id', element: <ProjectDetail /> },
          { path: '/areas/:id', element: <AreaDetail /> },
          { path: '/tags', element: <Tags /> },
          { path: '/tags/:tagId', element: <TagDetail /> },
          { path: '/trash', element: <Trash /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
