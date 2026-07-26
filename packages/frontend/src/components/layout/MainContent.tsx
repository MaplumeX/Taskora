import { Outlet } from 'react-router-dom';

export function MainContent() {
  return (
    <main className="flex-1 overflow-y-auto bg-background scroll-smooth">
      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 pb-12 pt-8">
        <Outlet />
      </div>
    </main>
  );
}