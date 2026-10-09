import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FolderPlus, Heading, Layers, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useContentBottomActionsForRoute,
  useMultiSelectStore,
  useUiInteractionStore,
} from '@taskora/api';
import { cn } from '@/lib/utils';

/**
 * 手机端右下角悬浮添加按钮（对应 Things 的 Magic Plus）。
 * - 默认（可添加任务的页面）：直接点击创建任务。
 * - 首页：弹出朝上菜单选择「添加任务（落收件箱）/ 新增项目 / 新增区域」。
 * - area 详情页：弹出朝上菜单选择「添加项目」。
 * - project 详情页：弹出朝上菜单选择「添加标题」。
 * - 页面无任何添加动作（upcoming/calendar/logbook/trash）或处于多选模式时不渲染；
 *   有任务展开时缩小淡出（底部换成展开任务的工具栏）。
 */
export function MobileFab() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    showAddTask,
    showAddProject,
    showAddHeading,
    showAddArea,
    handleAddTask,
    handleAddProject,
    handleAddHeading,
    handleAddArea,
    addTaskPending,
    addProjectPending,
    addHeadingPending,
    addAreaPending,
  } = useContentBottomActionsForRoute();
  // 首页的项目为顶层新建（不归属区域），文案与侧边栏「添加」菜单一致
  const addProjectLabel = showAddArea ? t('common:newProject') : t('project:addProject');
  const multiSelecting = useMultiSelectStore((s) => s.active);
  const taskExpanded = useUiInteractionStore((s) => s.expandedId !== null);
  // 回顾模式底部有回顾工具栏：按钮让到它上方
  const inReview = useLocation().pathname.startsWith('/review/');

  // 多选模式中底部由多选工具栏占据。
  if (multiSelecting) return null;
  if (!showAddTask && !showAddProject && !showAddHeading && !showAddArea) return null;

  // 首页与场景详情页（area/project）点击 FAB 弹出朝上菜单展示全部可用动作；
  // 普通页面仅有一个动作时直接执行，减少一次点击
  const actionCount =
    (showAddTask ? 1 : 0) +
    (showAddProject ? 1 : 0) +
    (showAddHeading ? 1 : 0) +
    (showAddArea ? 1 : 0);
  const hasMenu = actionCount > 1;
  const pending = addTaskPending || addProjectPending || addHeadingPending || addAreaPending;

  const fab = (
    <Button
      type="button"
      aria-label={t('task:addTask')}
      disabled={pending}
      onClick={() => {
        if (hasMenu) return; // 由 DropdownMenuTrigger 处理
        handleAddTask();
      }}
      className="h-14 w-14 rounded-full shadow-popover"
      size="icon"
    >
      <Plus className="h-6 w-6" />
    </Button>
  );

  return (
    <div
      // 任务展开时底部由 ExpandedTaskToolbar 占据（对齐 Things 3）：FAB 缩小淡出、
      // 让出交互，收起后弹回。
      aria-hidden={taskExpanded || undefined}
      // React 18 不认布尔 inert，传空串。
      {...(taskExpanded && { inert: '' })}
      className={cn(
        'fixed right-5 z-40 transition-[opacity,transform] duration-base ease-spring md:hidden',
        taskExpanded ? 'pointer-events-none scale-75 opacity-0' : 'scale-100 opacity-100',
        inReview
          ? 'bottom-[calc(5rem+var(--safe-area-bottom)+var(--kb-inset,0px))]'
          : 'bottom-[calc(1.25rem+var(--safe-area-bottom)+var(--kb-inset,0px))]',
      )}
    >
      {hasMenu ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>{fab}</DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            // 新建后标题 / 任务输入框会自动聚焦，菜单关闭时不要把焦点还给 FAB
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            {showAddTask && (
              <DropdownMenuItem disabled={addTaskPending} onClick={() => handleAddTask()}>
                <Plus className="h-4 w-4" />
                {t('task:addTask')}
              </DropdownMenuItem>
            )}
            {showAddProject && (
              <DropdownMenuItem disabled={addProjectPending} onClick={() => handleAddProject()}>
                <FolderPlus className="h-4 w-4" />
                {addProjectLabel}
              </DropdownMenuItem>
            )}
            {showAddArea && (
              <DropdownMenuItem disabled={addAreaPending} onClick={() => handleAddArea()}>
                <Layers className="h-4 w-4" />
                {t('common:newArea')}
              </DropdownMenuItem>
            )}
            {showAddHeading && (
              <DropdownMenuItem disabled={addHeadingPending} onClick={() => handleAddHeading()}>
                <Heading className="h-4 w-4" />
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
