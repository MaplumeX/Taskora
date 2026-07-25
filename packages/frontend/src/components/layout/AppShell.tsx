import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { SearchBar } from '@/components/search/SearchBar';

export function AppShell() {
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <div className="flex h-screen flex-1 flex-col">
        <SearchBar />
        <MainContent />
      </div>
    </div>
  );
}