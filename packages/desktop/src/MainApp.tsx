import { lazy, Suspense } from 'react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@taskora/ui/components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

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
 * Main window: the desktop navigation shell. The router keeps the same
 * URL shape as the web client so shared hooks (usePageTaskContext etc.)
 * work unchanged; MemoryRouter because there is no browser history here.
 */
export function MainApp() {
  return (
    <MemoryRouter initialEntries={['/today']}>
      <Suspense fallback={<PageFallback />}>
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
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
}
