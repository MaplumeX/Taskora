import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FolderPlus, Layers, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';

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
import { MAGIC_PLUS_ID, magicPlusDragData } from '../../lib/magicPlus';
import { useMagicPlusAvailable } from '../../lib/appDnd';

/**
 * 手机端右下角悬浮添加按钮（对应 Things 的 Magic Plus）。
 * - 默认（可添加任务的页面）：直接点击创建任务。
 * - 首页：弹出朝上菜单选择「添加任务（落收件箱）/ 新增项目 / 新增区域」。
 * - area 详情页：直接创建任务（对齐 Things：区域里的新项目由首页把按钮
 *   拖进该区域新建，不进菜单；桌面底栏的「添加项目」不受影响）。
 * - project 详情页：直接创建任务（对齐 Things：标题由拖到左边缘新建，
 *   不进菜单；桌面底栏的「添加标题」不受影响）。
 * - 页面无任何添加动作（calendar/logbook/trash）或处于多选模式时不渲染；
 *   有任务展开时缩小淡出（底部换成展开任务的工具栏）。
 * - 当前页有列表接收时可按住拖动（Magic Plus，见 lib/magicPlus.ts）：移动 8px
 *   起拖，新条目落在松手处；拖回原位取消。有菜单的页面同样可拖：菜单改为
 *   点击（而非按下）时打开，按下后移动就是拖动。
 *
 * scope：首页的项目 / 区域列表在首页自己的拖拽上下文里（与隐藏的桌面侧边栏
 * 隔开），所以首页由 Home 在那个上下文里渲染一个 scope="home" 的按钮，
 * 应用壳里的按钮在首页让位。
 */
export function MobileFab({ scope = 'shell' }: { scope?: 'shell' | 'home' }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    showAddTask,
    showAddProject,
    showAddArea,
    handleAddTask,
    handleAddProject,
    handleAddArea,
    addTaskPending,
    addProjectPending,
    addAreaPending,
  } = useContentBottomActionsForRoute();
  // 首页的项目为顶层新建（不归属区域），文案与侧边栏「添加」菜单一致
  const addProjectLabel = showAddArea ? t('common:newProject') : t('project:addProject');
  const multiSelecting = useMultiSelectStore((s) => s.active);
  const taskExpanded = useUiInteractionStore((s) => s.expandedId !== null);
  const { pathname } = useLocation();
  // 回顾模式底部有回顾工具栏：按钮让到它上方
  const inReview = pathname.startsWith('/review/');
  const magicPlusAvailable = useMagicPlusAvailable();

  // 只有首页点击 FAB 弹出朝上菜单展示全部可用动作；其余页面（含区域页，
  // 对齐 Things）点按直接新建任务
  const actionCount = (showAddTask ? 1 : 0) + (showAddProject ? 1 : 0) + (showAddArea ? 1 : 0);
  const hasMenu = showAddArea && actionCount > 1;
  const pending = addTaskPending || addProjectPending || addAreaPending;
  const canDrag = magicPlusAvailable && showAddTask && !pending && !multiSelecting;
  const draggable = useDraggable({ id: MAGIC_PLUS_ID, data: magicPlusDragData, disabled: !canDrag });

  if ((pathname === '/home') !== (scope === 'home')) return null;
  // 多选模式中底部由多选工具栏占据。
  if (multiSelecting) return null;
  if (!showAddTask && !showAddProject && !showAddArea) return null;

  const fab = (
    <Button
      ref={canDrag ? draggable.setNodeRef : undefined}
      type="button"
      aria-label={t('task:addTask')}
      disabled={pending}
      onClick={() => {
        if (hasMenu) setMenuOpen(true);
        else handleAddTask();
      }}
      {...(canDrag ? draggable.listeners : {})}
      className={cn(
        'h-14 w-14 rounded-full shadow-popover',
        // 触屏移动交给拖拽，不让浏览器当作平移（否则 pointercancel）。
        canDrag && 'touch-none',
        // 拖动中原位留一个淡出的空位，跟手的是浮层（appDnd）。
        draggable.isDragging && 'opacity-30',
      )}
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
          <DropdownMenuTrigger
            asChild
            // 菜单在点击时打开（见上方 onClick）：Radix 默认按下即开，会和
            // 按住拖动冲突。拦下 Radix 的按下处理（拖拽源的按下已先执行）。
            onPointerDown={(event) => event.preventDefault()}
          >
            {fab}
          </DropdownMenuTrigger>
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
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        fab
      )}
    </div>
  );
}
