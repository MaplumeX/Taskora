import { Outlet } from 'react-router-dom';

export function MainContent() {
  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <Outlet />
      </div>
    </main>
  );
}