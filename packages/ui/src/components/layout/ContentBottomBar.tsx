import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FolderPlus, Heading, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { SearchModal } from '@/components/search/SearchModal';
import { useContentBottomActionsForRoute } from '@taskora/api';

export function ContentBottomBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    showAddTask,
    showAddProject,
    showAddHeading,
    handleAddTask,
    handleAddProject,
    handleAddHeading,
    addTaskPending,
    addProjectPending,
    addHeadingPending,
  } = useContentBottomActionsForRoute();

  // Cmd/Ctrl+K → open search modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 助手页有自己的输入框与搜索能力，隐藏任务管理的底部动作条
  if (pathname.startsWith('/agent')) return null;

  return (
    <>
      <footer className="hidden h-11 shrink-0 items-center justify-center gap-2 border-t bg-background px-4 md:flex">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('task:searchTasks')}
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-5 w-5" />
        </Button>
        {showAddProject && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('project:addProject')}
            onClick={handleAddProject}
            disabled={addProjectPending}
          >
            <FolderPlus className="h-5 w-5" />
          </Button>
        )}
        {showAddHeading && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('project:addHeading')}
            onClick={handleAddHeading}
            disabled={addHeadingPending}
          >
            <Heading className="h-5 w-5" />
          </Button>
        )}
        {showAddTask && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('task:addTask')}
            onClick={handleAddTask}
            disabled={addTaskPending}
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </footer>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
