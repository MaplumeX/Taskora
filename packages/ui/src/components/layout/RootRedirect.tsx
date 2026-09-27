import { Navigate } from 'react-router-dom';

import { useIsDesktop } from '../../lib/use-media-query';

/** `/` 的落地页：窄屏进首页列表（Things 3 iOS），宽屏有侧边栏直接进 Today。 */
export function RootRedirect() {
  const isDesktop = useIsDesktop();
  return <Navigate to={isDesktop ? '/today' : '/home'} replace />;
}
