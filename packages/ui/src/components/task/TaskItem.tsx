import {
  useCalendarDay,
  parseCalendarDate,
  startOfTomorrow,
  taskKeys,
  useTaskQuery,
  useUpdateTask,
  useUiInteractionStore,
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
import { TaskTagCapsules } from './TaskTagCapsules';
import { TaskRowExpanded } from './TaskRowExpanded';
import { useCompletionRhythm } from './useCompletionRhythm';

/** 展开 / 收起详情的时长，与 tokens.css 的 --dur-expand 一致。 */
const EXPAND_MS = 200;
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
  const expanded = selectionState === 'expanded';
  // 详情区的挂载与开合分离：展开时先以 0fr 挂载、下一帧过渡到 1fr；收起时先过渡
  // 到 0fr，结束后再卸载。展开与收起共用 EXPAND_MS 与同一缓动曲线。
  const [detailsMounted, setDetailsMounted] = React.useState(expanded);
  const [detailsOpen, setDetailsOpen] = React.useState(expanded);
  React.useEffect(() => {
    if (expanded) {
      setDetailsMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setDetailsOpen(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setDetailsOpen(false);
    const id = window.setTimeout(() => setDetailsMounted(false), EXPAND_MS);
    return () => window.clearTimeout(id);
  }, [expanded]);
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

  // Reveal Task（点通知定位任务）：目标行展开挂载后滚到视野中央，一次性。
  const revealing = useUiInteractionStore((s) => expanded && s.revealId === task.id);
  React.useEffect(() => {
    if (!revealing) return;
    const id = requestAnimationFrame(() => {
      rowRef.current?.scrollIntoView?.({ block: 'center' });
      useUiInteractionStore.getState().setRevealId(null);
    });
    return () => cancelAnimationFrame(id);
  }, [revealing]);

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

  const {
    pendingComplete,
    exiting,
    toggle: handleToggle,
  } = useCompletionRhythm(settled, onToggleComplete);

  const tag = projectTitle ?? areaTitle;

  return (
    <div
      data-task-item
      aria-selected={
        selectionState === 'selected' || selectionState === 'expanded' ? true : undefined
      }
      className={cn(
        // 完成收起：grid-template-rows 1fr → 0fr + 淡出（useCompletionRhythm）。
        // 展开浮起（外边距 / 阴影）用 expand；完成收起用 base（与 COMPLETE_EXIT_MS 一致）。
        // 底色不过渡：选中高亮即时出现（同侧边栏 hover-instant）。
        'group grid rounded-md transition-[grid-template-rows,opacity,margin,box-shadow] ease-expand',
        exiting ? 'duration-base' : 'duration-expand',
        exiting ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]',
        selectionState === 'selected' && 'bg-selection',
        // 展开：浮起卡片，上下推开相邻行。
        selectionState === 'expanded' && 'my-3 rounded-[10px] bg-card shadow-row-lift',
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
      <div className={cn('flex min-h-0 flex-col', exiting && 'overflow-hidden')}>
        <TaskContextMenu task={task} current={current}>
          <div
            ref={rowRef}
            data-selection-row={task.id}
            tabIndex={onRowClick ? (selectionState !== 'idle' ? 0 : -1) : undefined}
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1 transition-colors',
              // 无归属任务保持单行紧凑高度；有归属时由标题行 + 归属小字行
              // 自然撑高（参考 Things 3 的两段式任务行）。
              !tag && 'h-8 max-md:h-11',
              // 选中态已有 bg-accent 指示，抑制原生 outline；
              // 仅聚焦但未选中（如 Tab 聚焦）时显示细 ring 保持键盘可访问性。
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
              selectionState !== 'idle' && 'focus-visible:ring-0',
              !expanded && selectionState === 'idle' && 'hover:bg-accent/60',
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
              <TaskCheckbox
                checked={completed || pendingComplete}
                cancelled={cancelled}
                onToggle={handleToggle}
              />
            </span>

            {/* 行首日期标记 + 重复图标:参考 Things 3 的 [chip][↻] 标题 结构。
            ≤ 今天 → 黄星；未来日期 → 灰色短日期 chip（两者互斥）。
            已了结任务（Logbook）不适用：行首改显示了结时间。
            展开时这些信息改由卡片底栏的字段 chip 呈现，行内不重复。 */}
            {expanded ? null : settled ? (
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
                      'min-w-0 flex-1 border-0 bg-transparent px-0 text-body font-normal shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
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
                      'truncate text-left text-body transition-colors',
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
              {tag && <span className="truncate text-meta text-muted-foreground">{tag}</span>}
            </div>

            <div className={cn('flex min-w-0 shrink items-center gap-2', expanded && 'hidden')}>
              <TaskTagCapsules tags={current.tags} />
              {/* 提醒徽标不受 showScheduledBadge 限制：Today/Scheduled 等视图
              不展示日期徽标时仍能看到提醒时刻（reminders spec）。 */}
              <TaskReminderBadge reminderTime={current.reminderTime} className="shrink-0" />
              {/* 截止徽标在行尾右对齐（参考 Things 3 的旗帜 + 日期）。 */}
              <TaskDueDateBadge dueDate={current.dueDate} className="shrink-0" />
            </div>
          </div>
        </TaskContextMenu>

        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-expand ease-expand',
            detailsOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            {detailsMounted && <TaskRowExpanded task={task} current={current} />}
          </div>
        </div>
      </div>
    </div>
  );
}
