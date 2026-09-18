import { useLocation } from 'react-router-dom';
import { FolderPlus, Heading, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { SearchModal } from '@/components/search/SearchModal';
import { useContentBottomActionsForRoute, useUiInteractionStore } from '@taskora/api';

export function ContentBottomBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // 搜索入口由全局 keymap registry（⌘F/Ctrl+F）驱动，状态提升到
  // uiInteraction store；本组件只负责挂载 SearchModal。
  const searchOpen = useUiInteractionStore((s) => s.searchOpen);
  const setSearchOpen = useUiInteractionStore((s) => s.setSearchOpen);
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

  // 助手页有自己的输入框与搜索能力，隐藏任务管理的底部动作条
  if (pathname.startsWith('/agent')) return null;

  return (
    <>
      <footer className="hidden h-11 shrink-0 items-center justify-center gap-2 border-t bg-background px-4 md:flex">
        <Hint label={t('task:searchTasks')} action="search">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('task:searchTasks')}
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-5 w-5" />
          </Button>
        </Hint>
        {showAddProject && (
          <Hint label={t('project:addProject')} action="newProject">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('project:addProject')}
              onClick={handleAddProject}
              disabled={addProjectPending}
            >
              <FolderPlus className="h-5 w-5" />
            </Button>
          </Hint>
        )}
        {showAddHeading && (
          <Hint label={t('project:addHeading')} action="newHeading">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('project:addHeading')}
              onClick={handleAddHeading}
              disabled={addHeadingPending}
            >
              <Heading className="h-5 w-5" />
            </Button>
          </Hint>
        )}
        {showAddTask && (
          <Hint label={t('task:addTask')} action="newTask">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('task:addTask')}
              onClick={handleAddTask}
              disabled={addTaskPending}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </Hint>
        )}
      </footer>
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
