import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

export function MainContent() {
  return (
    <main className="flex-1 overflow-y-auto bg-background scroll-smooth">
      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 pb-12 pt-8">
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