import { pageLoaders } from '@taskora/ui/lib/page-loaders';
import { NavigationPreloadProvider } from '@taskora/ui/lib/navigation-preload';
import { lazy, Suspense, useEffect } from 'react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from '@taskora/ui/components/layout/AppShell';
import { RootRedirect } from '@taskora/ui/components/layout/RootRedirect';
import { ProtectedRoute } from './ProtectedRoute';
import { setCurrentRoute } from './windows/open-window';

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
    </div>
  );
}

const AgentPage = lazy(pageLoaders.Agent);
const Anytime = lazy(pageLoaders.Anytime);
const AreaDetail = lazy(pageLoaders.AreaDetail);
const Calendar = lazy(pageLoaders.Calendar);
const Home = lazy(pageLoaders.Home);
const Inbox = lazy(pageLoaders.Inbox);
const Logbook = lazy(pageLoaders.Logbook);
const Deadlines = lazy(pageLoaders.Deadlines);
const Tomorrow = lazy(pageLoaders.Tomorrow);
const Repeating = lazy(pageLoaders.Repeating);
const AllProjects = lazy(pageLoaders.AllProjects);
const LoggedProjects = lazy(pageLoaders.LoggedProjects);
const Review = lazy(pageLoaders.Review);
const ProjectDetail = lazy(pageLoaders.ProjectDetail);
const Search = lazy(pageLoaders.Search);
const Someday = lazy(pageLoaders.Someday);
const LaterProjects = lazy(pageLoaders.LaterProjects);
const TagDetail = lazy(pageLoaders.TagDetail);
const Tags = lazy(pageLoaders.Tags);
const Today = lazy(pageLoaders.Today);
const Trash = lazy(pageLoaders.Trash);
const Upcoming = lazy(pageLoaders.Upcoming);

/** 记下本窗口所在的列表，供 Router 之外的新窗口按钮（⌥ + 点击）读取。 */
function RouteTracker() {
  const { pathname } = useLocation();
  useEffect(() => setCurrentRoute(pathname), [pathname]);
  return null;
}

/**
 * Main window: the desktop navigation shell. The router keeps the same
 * URL shape as the web client so shared hooks (usePageTaskContext etc.)
 * work unchanged; MemoryRouter because there is no browser history here.
 * Secondary windows (multi-window) render the same shell starting at the
 * route they were opened with.
 */
export function MainApp({ initialRoute = '/today' }: { initialRoute?: string }) {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <RouteTracker />
      <NavigationPreloadProvider platform="desktop">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/home" element={<Home />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/today" element={<Today />} />
                <Route path="/upcoming" element={<Upcoming />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/anytime" element={<Anytime />} />
                <Route path="/someday" element={<Someday />} />
                <Route path="/later-projects" element={<LaterProjects />} />
                <Route path="/review/*" element={<Review />} />
                <Route path="/logbook" element={<Logbook />} />
                <Route path="/deadlines" element={<Deadlines />} />
                <Route path="/tomorrow" element={<Tomorrow />} />
                <Route path="/repeating" element={<Repeating />} />
                <Route path="/all-projects" element={<AllProjects />} />
                <Route path="/logged-projects" element={<LoggedProjects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/areas/:id" element={<AreaDetail />} />
                <Route path="/tags" element={<Tags />} />
                <Route path="/tags/:tagId" element={<TagDetail />} />
                <Route path="/trash" element={<Trash />} />
                <Route path="/search" element={<Search />} />
                <Route path="/agent" element={<AgentPage />} />
                <Route path="*" element={<Navigate to="/today" replace />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </NavigationPreloadProvider>
    </MemoryRouter>
  );
}
