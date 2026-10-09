import type * as React from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, FolderPlus, Heading, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { QuickFind } from '@/components/search/QuickFind';
import { ExpandedTaskToolbar } from '@/components/task/ExpandedTaskToolbar';
import {
  useAssistantUiStore,
  useContentBottomActionsForRoute,
  useUiInteractionStore,
} from '@taskora/api';
import { cn } from '@/lib/utils';

export function ContentBottomBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // 搜索入口由全局 keymap registry（⌘F/Ctrl+F）驱动，状态提升到
  // uiInteraction store；本组件只负责挂载 QuickFind。
  const searchOpen = useUiInteractionStore((s) => s.searchOpen);
  const setSearchOpen = useUiInteractionStore((s) => s.setSearchOpen);
  const panelOpen = useAssistantUiStore((s) => s.panelOpen);
  const togglePanel = useAssistantUiStore((s) => s.togglePanel);
  const taskExpanded = useUiInteractionStore((s) => s.expandedId !== null);
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
      <footer className="relative hidden h-11 shrink-0 bg-background px-4 md:block">
        {/* 任务展开时整栏切换为作用于该任务的动作（对齐 Things 3），收起即切回：
            两组按钮叠放，与行展开同时长交叉淡入淡出。 */}
        <BarLayer shown={taskExpanded}>
          <ExpandedTaskToolbar variant="bar" />
        </BarLayer>
        <BarLayer shown={!taskExpanded}>
          <Hint label={t('search:title')} action="search">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('search:title')}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
            </Button>
          </Hint>
          {/* 助手面板开关：底部栏只在桌面非助手页出现，正好是面板的适用范围 */}
          <Hint label={t('agent:assistantPanel')} action="toggleAssistantPanel">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('agent:assistantPanel')}
              aria-pressed={panelOpen}
              className={cn(panelOpen && 'bg-accent text-primary')}
              onClick={togglePanel}
            >
              <Bot className="h-5 w-5" />
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
        </BarLayer>
      </footer>
      <QuickFind open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

/**
 * 底栏的一组按钮。隐藏的一组淡出、略微下沉并让出交互（aria-hidden + inert，
 * 不可点、不可 Tab 到），显示的一组从下方浮起淡入。
 */
function BarLayer({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!shown || undefined}
      // React 18 不认布尔 inert，传空串。
      {...(!shown && { inert: '' })}
      className={cn(
        'absolute inset-0 flex items-center justify-center gap-2 transition-[opacity,transform] duration-expand ease-expand',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1.5 opacity-0',
      )}
    >
      {children}
    </div>
  );
}
