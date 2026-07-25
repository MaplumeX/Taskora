import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';

export function AppShell() {
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <MainContent />
    </div>
  );
}