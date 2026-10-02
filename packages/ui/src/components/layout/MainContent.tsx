import {
  useCalendarQueryRefresh,
  useCurrentUser,
  useMultiSelectStore,
  useUiInteractionStore,
} from '@taskora/api';
import { Search } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { usePullToFind } from '../../lib/usePullToFind';
import { cn } from '@/lib/utils';

/**
 * Canvas-style pages break out of the narrow `max-w-2xl` list container and
 * fill the main content area (full width + viewport height; the page content
 * itself stretches to fill, scrolling only as a short-viewport fallback).
 * `/calendar` keeps a small inset on wide screens and goes edge-to-edge on
 * small ones (its dense month grid needs every pixel; the page pads its header); the Assistant chat (`/agent`) goes full
 * bleed like ChatGPT — the page manages its own padding and scroll.
 * On small screens these h-full containers must clear the bottom safe-area
 * inset (gesture bar), otherwise the calendar's last grid row / the chat
 * composer sits under it.
 */
const CANVAS_ROUTES = ['/calendar'];
const FULL_BLEED_ROUTES = ['/agent'];

export function isCanvasRoute(pathname: string): boolean {
  return CANVAS_ROUTES.includes(pathname);
}

function isFullBleedRoute(pathname: string): boolean {
  return FULL_BLEED_ROUTES.includes(pathname);
}

/** 可下拉打开 Quick Find 的列表类页面（手机首页、Bucket 视图、项目 / 区域 / 标签页）。 */
const PULL_TO_FIND_ROUTES = [
  '/home',
  '/inbox',
  '/today',
  '/upcoming',
  '/anytime',
  '/someday',
  '/logbook',
  '/trash',
  '/later-projects',
  '/tags',
];
const PULL_TO_FIND_PREFIXES = ['/projects/', '/areas/', '/tags/'];

export function isPullToFindRoute(pathname: string): boolean {
  return (
    PULL_TO_FIND_ROUTES.includes(pathname) ||
    PULL_TO_FIND_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function MainContent() {
  useCurrentUser();
  useCalendarQueryRefresh();
  const { pathname } = useLocation();
  const canvas = isCanvasRoute(pathname);
  const fullBleed = isFullBleedRoute(pathname);
  const mainRef = useRef<HTMLElement>(null);
  // 多选模式中下拉不打开搜索（工具栏动作针对当前列表）
  const multiSelectActive = useMultiSelectStore((s) => s.active);
  const pull = usePullToFind(mainRef, () => useUiInteractionStore.getState().openSearch(), {
    enabled: isPullToFindRoute(pathname) && !multiSelectActive,
  });

  return (
    <main
      ref={mainRef}
      className={cn(
        'flex-1 bg-background scroll-smooth',
        // Full-bleed pages own their scrolling; others scroll the main pane.
        fullBleed ? 'overflow-hidden' : 'overflow-y-auto',
      )}
    >
      {pull.distance > 0 && (
        <div
          aria-hidden
          data-testid="pull-to-find"
          data-armed={pull.armed}
          className="flex items-end justify-center overflow-hidden"
          style={{ height: pull.distance }}
        >
          <Search
            className={cn(
              'mb-2 h-5 w-5 transition-colors duration-fast',
              pull.armed ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </div>
      )}
      <div
        className={cn(
          'relative z-10 mx-auto w-full',
          fullBleed
            ? 'h-full max-md:pb-[var(--safe-area-bottom)]'
            : canvas
              ? 'h-full pt-2 md:px-6 md:pt-4 max-md:pb-[var(--safe-area-bottom)]'
              : 'max-w-3xl px-4 pb-24 pt-2 md:px-12 md:pb-12 md:pt-10',
        )}
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-transparent" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
    </main>
  );
}
