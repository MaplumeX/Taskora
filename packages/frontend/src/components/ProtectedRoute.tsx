import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '@taskora/api';

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const refreshing = useAuthStore((s) => s.refreshing);

  // Startup recovery in progress with only a token restored (post-login full
  // page reload): wait for the user to come back before rendering, so the
  // app doesn't flash an "unauthenticated" UI (e.g. Sidebar) at the user.
  if (refreshing && !user) {
    return null;
  }

  // If we have a token, allow through.
  if (token) {
    return <Outlet />;
  }

  // If a silent refresh is in progress (e.g. legacy snapshot recovery), wait for it.
  if (refreshing) {
    return null;
  }

  return <Navigate to="/login" replace />;
}
