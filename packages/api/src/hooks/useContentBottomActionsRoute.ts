import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { reviewDetailOf } from './reviewRoute';
import { useContentBottomActions } from './useContentBottomActions';
import { usePageTaskContext } from './usePageTaskContext';

/** 当前 pathname 的逻辑视图。 */
export function viewOf(pathname: string): string {
  if (pathname === '/') return 'today';
  const segment = pathname.split('/').filter(Boolean)[0] ?? 'today';
  return segment;
}

/**
 * Route-driven wrapper around `useContentBottomActions` for hosts using
 * react-router (web BrowserRouter, desktop MemoryRouter — same URL shape).
 * Derives the view/route-param/task-creation context from the current
 * location and navigates to a new project's detail route after creation.
 */
export function useContentBottomActionsForRoute() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { id } = useParams<{ id: string }>();
  const createTaskContext = usePageTaskContext();
  const review = reviewDetailOf(pathname);

  return useContentBottomActions({
    view: review?.view ?? viewOf(pathname),
    routeId: review?.id ?? id,
    createTaskContext,
    navigateToProject: (projectId) => navigate(`/projects/${projectId}`),
    navigateToArea: (areaId) => navigate(`/areas/${areaId}`),
    navigateToInbox: () => navigate('/inbox'),
  });
}
