import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Anytime from '@/pages/Anytime';
import AreaDetail from '@/pages/AreaDetail';
import Inbox from '@/pages/Inbox';
import Logbook from '@/pages/Logbook';
import Login from '@/pages/Login';
import ProjectDetail from '@/pages/ProjectDetail';
import Register from '@/pages/Register';
import Someday from '@/pages/Someday';
import Tags from '@/pages/Tags';
import TagDetail from '@/pages/TagDetail';
import Today from '@/pages/Today';
import Trash from '@/pages/Trash';
import Upcoming from '@/pages/Upcoming';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
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