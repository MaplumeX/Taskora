import { useState } from 'react';
import { FolderPlus, Heading, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useContentBottomActionsForRoute } from '@taskora/api';

/**
 * 手机端右下角悬浮添加按钮。
 * - 默认（可添加任务的页面）：直接点击创建任务。
 * - area 详情页：弹出朝上菜单选择「添加项目」。
 * - project 详情页：弹出朝上菜单选择「添加标题」。
 * - 页面无任何添加动作（upcoming/calendar/logbook/trash）时不渲染。
 */
export function MobileFab() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
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

  if (!showAddTask && !showAddProject && !showAddHeading) return null;

  // 场景详情页（area/project）点击 FAB 弹出朝上菜单展示全部可用动作（添加任务+项目/标题）；
  // 普通页面仅有一个动作时直接执行，减少一次点击
  const actionCount =
    (showAddTask ? 1 : 0) + (showAddProject ? 1 : 0) + (showAddHeading ? 1 : 0);
  const hasMenu = actionCount > 1;
  const pending = addTaskPending || addProjectPending || addHeadingPending;

  const fab = (
    <Button
      type="button"
      aria-label={t('task:addTask')}
      disabled={pending}
      onClick={() => {
        if (hasMenu) return; // 由 DropdownMenuTrigger 处理
        handleAddTask();
      }}
      className="h-14 w-14 rounded-full shadow-lift"
      size="icon"
    >
      <Plus className="h-6 w-6" />
    </Button>
  );

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom)+var(--kb-inset,0px))] right-4 z-40 md:hidden">
      {hasMenu ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>{fab}</DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end">
            {showAddTask && (
              <DropdownMenuItem
                disabled={addTaskPending}
                onClick={() => handleAddTask()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('task:addTask')}
              </DropdownMenuItem>
            )}
            {showAddProject && (
              <DropdownMenuItem
                disabled={addProjectPending}
                onClick={() => handleAddProject()}
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                {t('project:addProject')}
              </DropdownMenuItem>
            )}
            {showAddHeading && (
              <DropdownMenuItem
                disabled={addHeadingPending}
                onClick={() => handleAddHeading()}
              >
                <Heading className="mr-2 h-4 w-4" />
                {t('project:addHeading')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        fab
      )}
    </div>
  );
}
