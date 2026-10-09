import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hasPendingLiveQueries, prefetchProject, useSyncStatusStore } from '@taskora/api';

import { canPreloadCode, startIdlePreload, type PreloadPlatform } from './idle-preload';
import { loaderForRoute, pageLoaders, settingsLoaders, shellLoaders } from './page-loaders';

const PreloadContext = createContext<PreloadPlatform | null>(null);

export function NavigationPreloadProvider({
  platform,
  children,
}: {
  platform: PreloadPlatform;
  children: ReactNode;
}) {
  return <PreloadContext.Provider value={platform}>{children}</PreloadContext.Provider>;
}

/** 位于页面 Suspense 内：当前页的代码提交后才开始等待首屏数据和空闲。 */
export function NavigationWarmup() {
  const platform = useContext(PreloadContext);
  const client = useQueryClient();
  useEffect(() => {
    if (!platform) return;
    const common = [
      pageLoaders.ProjectDetail,
      pageLoaders.AreaDetail,
      pageLoaders.Anytime,
      pageLoaders.Upcoming,
      pageLoaders.Inbox,
      pageLoaders.Someday,
    ];
    const remaining = [
      pageLoaders.Calendar,
      pageLoaders.Review,
      pageLoaders.Logbook,
      pageLoaders.LaterProjects,
      pageLoaders.Tags,
      pageLoaders.TagDetail,
      pageLoaders.Trash,
      pageLoaders.Search,
      pageLoaders.Home,
      pageLoaders.Today,
      shellLoaders.SettingsModal,
      ...Object.values(settingsLoaders),
      pageLoaders.Agent,
      shellLoaders.AssistantPanel,
    ];
    return startIdlePreload(
      (platform === 'desktop' ? [...common, ...remaining] : common).map(
        (loader) => () => loader.preload(),
      ),
      {
        canRun: () => canPreloadCode(platform),
        isReady: () =>
          !hasPendingLiveQueries() &&
          client.isFetching() === 0 &&
          useSyncStatusStore.getState().status !== 'syncing',
      },
    );
  }, [platform, client]);
  return null;
}

function routeAt(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return;
  const element = target.closest<HTMLElement>('[data-preload-route], a[href]');
  if (!element || element.closest('[aria-hidden="true"], [inert]')) return;
  const route = element.dataset.preloadRoute ?? element.getAttribute('href');
  if (!route) return;
  try {
    const url = new URL(route, window.location.href);
    if (url.origin === window.location.origin) return decodeURI(url.pathname);
  } catch {
    // 备注中的链接可能不合法，不让预取影响现有点击和编辑行为。
  }
}

/** 在壳上委托导航意图，覆盖侧边栏和页面内链接；触屏点击不提前拉代码。 */
export function useNavigationPreloadIntent() {
  const platform = useContext(PreloadContext);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return useMemo(() => {
    const cancel = () => clearTimeout(timer.current);
    const prepare = (route: string) => {
      if (!platform || document.visibilityState === 'hidden') return;
      const project = /^\/projects\/([^/]+)$/.exec(route);
      if (project) prefetchProject(project[1]);
      if (canPreloadCode(platform)) {
        void loaderForRoute(route)
          ?.preload()
          .catch(() => undefined);
        if (route === '/settings') void settingsLoaders.appearance.preload().catch(() => undefined);
      }
    };
    return {
      onPointerOver: (event: React.PointerEvent) => {
        if (!platform || event.pointerType === 'touch') return;
        const route = routeAt(event.target);
        if (!route || route === routeAt(event.relatedTarget)) return;
        cancel();
        timer.current = setTimeout(() => prepare(route), 100);
      },
      onPointerOut: (event: React.PointerEvent) => {
        if (routeAt(event.target) !== routeAt(event.relatedTarget)) cancel();
      },
      onFocusCapture: (event: React.FocusEvent) => {
        cancel();
        const route = routeAt(event.target);
        if (route) prepare(route);
      },
    };
  }, [platform]);
}
