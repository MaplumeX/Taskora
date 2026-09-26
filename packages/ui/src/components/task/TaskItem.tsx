import {
  useCalendarDay,
  parseCalendarDate,
  startOfTomorrow,
  taskKeys,
  useTaskQuery,
  useUpdateTask,
} from '@taskora/api';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskContextMenu } from './TaskContextMenu';
import { TaskDateBadge } from './TaskDateBadge';
import { TaskDueDateBadge } from './TaskDueDateBadge';
import { TaskTodayBadge } from './TaskTodayBadge';
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
  /** Logbook 专用：标题区后注入的了却日期徽标 */
  settledDateBadge?: React.ReactNode;
  /** Logbook 场景：已了结标题保留删除线但不置灰（正常前景色）。 */
  plainSettledTitle?: boolean;
}

export function TaskItem({
  task,
  projectTitle,
  areaTitle,
  selectionState = 'idle',
  onToggleComplete,
  onRowClick,
  showScheduledBadge = true,
  settledDateBadge,
  plainSettledTitle = false,
}: Props) {
  useCalendarDay();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: liveTask } = useTaskQuery(task.id);
  const current = liveTask ?? task;
  const completed = current.status === 'COMPLETED';
  const cancelled = current.status === 'CANCELLED';
  // 已了结（完成或取消）：标题置灰弱化；取消另加删除线（ADR 0006）。
  // Logbook 场景（plainSettledTitle）例外：不置灰，仅取消态保留删除线。
  const settled = completed || cancelled;
  const [exiting, setExiting] = React.useState(false);
  const expanded = selectionState === 'expanded';
  // When ≤ 今天（含逾期）视为「今天」语义：非语境视图显示黄星（参考
  // Things 3 的 Anytime 黄星），语境视图（Today/Upcoming）由列表本身
  // 表达语境、行上不再标记。When 永不逾期，红色只属于 Deadline。
  const scheduledOnOrBeforeToday = current.scheduledDate
    ? parseCalendarDate(current.scheduledDate) < startOfTomorrow()
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
            'flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 transition-[opacity,background-color]',
            // 无归属任务保持单行紧凑高度；有归属时由标题行 + 归属小字行
            // 自然撑高（参考 Things 3 的两段式任务行）。
            !tag && 'h-10 max-md:h-11',
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
          {/* 复选框放入 20px 固定槽位，与项目行/组头的进度环（20px）同宽，
            保证混合列表中任务与项目的标题起始位置对齐。 */}
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <TaskCheckbox checked={completed} cancelled={cancelled} onToggle={handleToggle} />
          </span>

          {/* 行首日期标记 + 重复图标:参考 Things 3 的 [chip][↻] 标题 结构。
            ≤ 今天 → 黄星；未来日期 → 灰色短日期 chip（两者互斥）。
            已了结任务（Logbook）不适用：行首改显示了结时间。 */}
          {settled ? (
            settledDateBadge
          ) : (
            <>
              {showScheduledBadge && scheduledOnOrBeforeToday && (
                <TaskTodayBadge className="shrink-0" />
              )}
              {showScheduledBadge && (
                <TaskDateBadge scheduledDate={current.scheduledDate} className="shrink-0" />
              )}
              <TaskRepeatBadge repeatRule={current.repeatRule} className="shrink-0" />
            </>
          )}

          {/* 标题区：备注/子任务徽标紧贴标题文本（参考 Things 3），
            而非被 flex-1 的标题推到行尾。有归属时归属小字在标题下方
            自成一行（参考 Things 3），行高随之增加。 */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
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
                    settled &&
                      (plainSettledTitle
                        ? cancelled
                          ? 'text-foreground line-through'
                          : 'text-foreground'
                        : cancelled
                          ? 'text-muted-foreground line-through'
                          : 'text-muted-foreground'),
                  )}
                />
              ) : (
                <span
                  className={cn(
                    'truncate text-left text-sm transition-colors',
                    settled
                      ? plainSettledTitle
                        ? cancelled
                          ? 'text-foreground line-through'
                          : 'text-foreground'
                        : cancelled
                          ? 'text-muted-foreground line-through'
                          : 'text-muted-foreground'
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
            {/* 归属上下文：标题下方一行灰色小字，只显示直接父级一层
              （projectTitle 优先，否则 areaTitle），参考 Things 3。
              移动端同样显示；分组视图内由组头承担归属、不传入。 */}
            {tag && (
              <span className="truncate text-xs leading-tight text-muted-foreground">{tag}</span>
            )}
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
