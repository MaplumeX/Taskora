import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { ContentBottomBar } from '@/components/layout/ContentBottomBar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <div className="flex h-screen flex-1 flex-col">
        <MainContent />
        <ContentBottomBar />
      </div>
    </div>
  );
}