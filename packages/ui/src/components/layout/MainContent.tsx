import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';

/**
 * Canvas-style pages break out of the narrow `max-w-2xl` list container and
 * fill the main content area (full width + viewport height; the page content
 * itself stretches to fill, scrolling only as a short-viewport fallback).
 * `/calendar` keeps a small inset; the Assistant chat (`/agent`) goes full
 * bleed like ChatGPT — the page manages its own padding and scroll.
 */
const CANVAS_ROUTES = ['/calendar'];
const FULL_BLEED_ROUTES = ['/agent'];

function isCanvasRoute(pathname: string): boolean {
  return CANVAS_ROUTES.includes(pathname);
}

function isFullBleedRoute(pathname: string): boolean {
  return FULL_BLEED_ROUTES.includes(pathname);
}

export function MainContent() {
  const { pathname } = useLocation();
  const canvas = isCanvasRoute(pathname);
  const fullBleed = isFullBleedRoute(pathname);

  return (
    <main
      className={cn(
        'flex-1 bg-background scroll-smooth',
        // Full-bleed pages own their scrolling; others scroll the main pane.
        fullBleed ? 'overflow-hidden' : 'overflow-y-auto',
      )}
    >
      <div
        className={cn(
          'relative z-10 mx-auto w-full',
          fullBleed
            ? 'h-full'
            : canvas
              ? 'h-full px-3 pt-2 md:px-6 md:pt-4'
              : 'max-w-2xl px-4 pb-20 pt-8 md:px-6 md:pb-12',
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
