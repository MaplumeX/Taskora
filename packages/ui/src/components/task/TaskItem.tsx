import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isOverdue, taskKeys, useTaskQuery, useUpdateTask } from '@taskora/api';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskContextMenu } from './TaskContextMenu';
import { TaskDateBadge } from './TaskDateBadge';
import { TaskDueDateBadge } from './TaskDueDateBadge';
import { TaskNotesBadge } from './TaskNotesBadge';
import { TaskReminderBadge } from './TaskReminderBadge';
import { TaskRepeatBadge } from './TaskRepeatBadge';
import { TaskSubtasksBadge } from './TaskSubtasksBadge';
import { TaskRowExpanded } from './TaskRowExpanded';
import type { SelectionState } from '@taskora/api';

interface Props {
  task: TaskResponseDto;
  projectTitle?: string;
  areaTitle?: string;
  selectionState?: SelectionState;
  onToggleComplete: () => void;
  onRowClick?: () => void;
  showScheduledBadge?: boolean;
}

export function TaskItem({
  task,
  projectTitle,
  areaTitle,
  selectionState = 'idle',
  onToggleComplete,
  onRowClick,
  showScheduledBadge = true,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: liveTask } = useTaskQuery(task.id);
  const current = liveTask ?? task;
  const completed = current.status === 'COMPLETED';
  const cancelled = current.status === 'CANCELLED';
  // 已了结（完成或取消）：标题删除线 + 弱化（ADR 0006）。
  const settled = completed || cancelled;
  const [exiting, setExiting] = React.useState(false);
  const expanded = selectionState === 'expanded';
  // 逾期例外:语境视图(Today/Upcoming)省略日期 chip(列表本身即语境),
  // 但逾期日期偏离语境,仍显示红色 chip 保留信号(参考 Things 3)。
  const scheduledOverdue = current.scheduledDate
    ? isOverdue(new Date(current.scheduledDate))
    : false;

  const updateTask = useUpdateTask();
  const [title, setTitle] = React.useState(current.title);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const rowRef = React.useRef<HTMLDivElement>(null);

  // Keep local title in sync with the server value when it changes externally.
  React.useEffect(() => {
    setTitle(current.title);
  }, [current.title]);

  // Auto-focus title on expand (caret at end, no full selection).
  React.useEffect(() => {
    if (!expanded) return;
    const el = titleInputRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  const commitTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== current.title) {
      updateTask.mutate(
        { id: task.id, data: { title: trimmed } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          },
          onError: () => toast.error(t('common:saveFailed')),
        },
      );
    } else {
      setTitle(current.title);
    }
  };

  const handleToggle = () => {
    if (!settled) {
      setExiting(true);
      window.setTimeout(onToggleComplete, 350);
    } else {
      onToggleComplete();
    }
  };

  const tag = projectTitle ?? areaTitle;

  return (
    <div
      data-task-item
      aria-selected={
        selectionState === 'selected' || selectionState === 'expanded' ? true : undefined
      }
      className={cn(
        'group flex flex-col rounded-lg transition-colors',
        selectionState === 'selected' && 'bg-accent',
        selectionState === 'expanded' && 'rounded-xl border border-border/60 bg-card shadow-soft',
      )}
      onKeyDown={(e) => {
        if (!expanded || e.key !== 'Escape' || !onRowClick) return;
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          e.preventDefault();
          // 收起前先把焦点还给行本身，避免输入框卸载后焦点落到 body。
          rowRef.current?.focus();
          onRowClick();
        }
      }}
    >
      <TaskContextMenu task={task} current={current}>
        <div
          ref={rowRef}
          data-selection-row={task.id}
          tabIndex={onRowClick ? (selectionState !== 'idle' ? 0 : -1) : undefined}
          className={cn(
            'flex h-10 min-w-0 items-center gap-3 rounded-lg px-2 transition-[opacity,background-color] max-md:h-11',
            // 选中态已有 bg-accent 指示，抑制原生 outline；
            // 仅聚焦但未选中（如 Tab 聚焦）时显示细 ring 保持键盘可访问性。
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
            selectionState !== 'idle' && 'focus-visible:ring-0',
            !expanded && 'hover:bg-accent/50',
            exiting && 'task-complete-anim',
          )}
          onClick={(e) => {
            if (!onRowClick) return;
            e.stopPropagation();
            onRowClick();
          }}
          role={onRowClick ? 'button' : undefined}
        >
          <TaskCheckbox checked={completed} cancelled={cancelled} onToggle={handleToggle} />

          {/* 行首日期 chip + 重复图标:参考 Things 3 的 [chip][↻] 标题 结构。 */}
          {(showScheduledBadge || scheduledOverdue) && (
            <TaskDateBadge scheduledDate={current.scheduledDate} className="shrink-0" />
          )}
          <TaskRepeatBadge repeatRule={current.repeatRule} className="shrink-0" />

          {/* 标题区：备注/子任务徽标紧贴标题文本（参考 Things 3），
            而非被 flex-1 的标题推到行尾。 */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {expanded ? (
              <Input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                placeholder={t('task:newTaskPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    e.preventDefault();
                    // Enter（含 ⌘Enter/Ctrl+Enter）：先 blur 触发提交，再收起，
                    // 避免出现「退出编辑」与「收起」拆成两次按键的中间态。
                    e.currentTarget.blur();
                    rowRef.current?.focus();
                    onRowClick?.();
                  } else if (e.key === ' ') {
                    e.stopPropagation();
                  } else if (e.key === 'Escape') {
                    setTitle(current.title);
                    e.currentTarget.blur();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'min-w-0 flex-1 border-0 px-0 text-sm font-normal shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
                  settled && 'text-muted-foreground line-through',
                )}
              />
            ) : (
              <span
                className={cn(
                  'truncate text-left text-sm transition-colors',
                  settled
                    ? 'text-muted-foreground line-through'
                    : current.title
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {current.title || t('task:newTaskPlaceholder')}
              </span>
            )}
            {/* 备注徽标：有备注的任务一眼可见。 */}
            <TaskNotesBadge notes={current.notes} className="shrink-0" />
            {/* 子任务徽标：有子任务的任务一眼可见，并显示未了结数量。 */}
            <TaskSubtasksBadge subtasks={current.subtasks} className="shrink-0" />
          </div>

          <div className="flex min-w-0 shrink items-center gap-2">
            {current.tags && current.tags.length > 0 && (
              <div className="hidden items-center gap-1 md:flex">
                {current.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag.id}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    title={tag.title}
                  />
                ))}
              </div>
            )}
            {tag && (
              <span className="hidden max-w-24 truncate text-xs text-muted-foreground md:inline">
                {tag}
              </span>
            )}
            {/* 提醒徽标不受 showScheduledBadge 限制：Today/Scheduled 等视图
              不展示日期徽标时仍能看到提醒时刻（reminders spec）。 */}
            <TaskReminderBadge reminderTime={current.reminderTime} className="shrink-0" />
            {/* 截止徽标在行尾右对齐（参考 Things 3 的旗帜 + 日期）。 */}
            <TaskDueDateBadge dueDate={current.dueDate} className="shrink-0" />
          </div>
        </div>
      </TaskContextMenu>

      {expanded && <TaskRowExpanded task={task} current={current} />}
    </div>
  );
}
