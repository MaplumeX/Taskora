import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { cn } from '@/lib/utils';

/**
 * Canvas-style pages break out of the narrow `max-w-2xl` list container and
 * fill the main content area (full width + viewport height; the page content
 * itself stretches to fill, scrolling only as a short-viewport fallback).
 * Currently only `/calendar`; all other routes keep the centered list layout.
 */
const CANVAS_ROUTES = ['/calendar'];

function isCanvasRoute(pathname: string): boolean {
  return CANVAS_ROUTES.includes(pathname);
}

export function MainContent() {
  const { pathname } = useLocation();
  const canvas = isCanvasRoute(pathname);

  return (
    <main className="flex-1 overflow-y-auto bg-background scroll-smooth">
      <div
        className={cn(
          'relative z-10 mx-auto w-full',
          canvas ? 'h-full px-6 pt-4' : 'max-w-2xl px-6 pb-12 pt-8',
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
