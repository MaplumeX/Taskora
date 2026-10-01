import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useNavigationRequestStore } from '@/stores/navigationRequest.store';

/** 在 Router 内常驻：取走平台壳投递的路由请求并执行。 */
export function useNavigationRequestListener(): void {
  const navigate = useNavigate();
  const pendingPath = useNavigationRequestStore((s) => s.pendingPath);
  useEffect(() => {
    if (pendingPath === null) return;
    const path = useNavigationRequestStore.getState().take();
    if (path !== null) navigate(path);
  }, [pendingPath, navigate]);
}
