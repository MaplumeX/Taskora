import { Outlet } from 'react-router-dom';

export function MainContent() {
  return (
    <main className="flex h-screen flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl px-8 py-6">
        <Outlet />
      </div>
    </main>
  );
}