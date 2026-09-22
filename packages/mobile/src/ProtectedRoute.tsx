import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '@taskora/api';

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const refreshing = useAuthStore((s) => s.refreshing);

  if (token || user) {
    return <Outlet />;
  }

  if (refreshing) {
    return null;
  }

  return <Navigate to="/today" replace />;
}
