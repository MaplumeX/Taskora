import { useCalendarDay, parseCalendarDate } from '@taskora/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectFeedItem, ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { TaskDueDateBadge } from '@/components/task/TaskDueDateBadge';
import { TaskTodayBadge } from '@/components/task/TaskTodayBadge';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { startOfTomorrow, useCompleteProject, useUncompleteProject } from '@taskora/api';
import type { SelectionState } from '@taskora/api';

interface Props {
  item: ProjectFeedItem;
  showScheduledBadge?: boolean;
  selectionState?: SelectionState;
  /** Logbook 专用：标题后注入的了却日期徽标 */
  settledDateBadge?: React.ReactNode;
  /** Logbook 场景：已了结标题保留删除线但不置灰（正常前景色）。 */
  plainSettledTitle?: boolean;
}

export function ProjectFeedRow({
  item,
  showScheduledBadge = true,
  selectionState = 'idle',
  settledDateBadge,
  plainSettledTitle = false,
}: Props) {
  useCalendarDay();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();
  const completed = item.status === 'COMPLETED';
  // 取消目前不属于项目模型（ADR 0006 明确 out of scope）；此分支作防御性呈现。
  const cancelled = item.status === ('CANCELLED' as ProjectStatus);
  const settled = completed || cancelled;
  const trashed = item.trashedAt !== null;

  const projectCast = item as unknown as ProjectResponseDto;

  const handleToggle = () => {
    // 防御：取消的项目暂不可经此撤销（模型不支持），退化为完成切换。
    (completed ? uncompleteProject : completeProject).mutate(item.id, {
      onError: () => toast.error(t('common:saveFailed')),
    });
  };

  return (
    <ProjectContextMenu
      project={projectCast}
      current={projectCast}
      variant={trashed ? 'trash' : 'default'}
    >
      <div
        data-task-item
        data-selection-row={item.id}
        tabIndex={selectionState !== 'idle' ? 0 : -1}
        aria-selected={selectionState !== 'idle' || undefined}
        className={cn(
          'group flex h-10 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-accent/40 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
          selectionState !== 'idle' && 'bg-accent focus-visible:ring-0 hover:bg-accent',
        )}
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/projects/${item.id}`);
        }}
        onKeyDown={(e) => {
          // Ignore keys coming from the nested progress ring button.
          if (e.target !== e.currentTarget) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          navigate(`/projects/${item.id}`);
        }}
        role="button"
      >
        <ProjectProgressRing
          total={item.taskTotalCount}
          completed={item.taskCompletedCount}
          projectStatus={item.status as ProjectStatus}
          onToggle={handleToggle}
        />
        {/* 与 TaskItem 对齐：已了结时行首位置显示了结时间（主题色）；
          未了结时 ≤ 今天 → 黄星，未来日期 → 灰色短日期 chip（两者互斥）。 */}
        {settled && settledDateBadge
          ? settledDateBadge
          : showScheduledBadge &&
            (item.scheduledDate && parseCalendarDate(item.scheduledDate) < startOfTomorrow() ? (
              <TaskTodayBadge className="shrink-0" />
            ) : (
              <TaskDateBadge scheduledDate={item.scheduledDate} />
            ))}
        <span
          className={cn(
            'flex-1 truncate text-left text-sm',
            settled || trashed
              ? plainSettledTitle && !trashed
                ? cancelled
                  ? 'text-foreground line-through'
                  : 'text-foreground'
                : cancelled
                  ? 'text-muted-foreground line-through'
                  : 'text-muted-foreground'
              : item.title
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {item.title || t('project:newItemPlaceholder')}
        </span>
        <div className="flex items-center gap-2">
          {item.tags.length > 0 && (
            <div className="hidden items-center gap-1 md:flex">
              {item.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag.id}
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  title={tag.title}
                />
              ))}
            </div>
          )}
          <TaskDueDateBadge dueDate={item.dueDate} />
        </div>
      </div>
    </ProjectContextMenu>
  );
}
