import { Navigate, Outlet } from 'react-router-dom';

import { useAuthStore } from '@/lib/stores/auth.store';

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const refreshing = useAuthStore((s) => s.refreshing);

  // If we have a token, allow through.
  if (token) {
    return <Outlet />;
  }

  // If a silent refresh is in progress (e.g. startup recovery), wait for it.
  if (refreshing) {
    return null;
  }

  return <Navigate to="/login" replace />;
}
