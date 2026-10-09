import { useCalendarDay, parseCalendarDate } from '@taskora/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectFeedItem, ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { TaskDateBadge, type ScheduledBadgeMode } from '@/components/task/TaskDateBadge';
import { TaskDueDateBadge } from '@/components/task/TaskDueDateBadge';
import { TaskTagCapsules } from '@/components/task/TaskTagCapsules';
import { TaskTodayBadge } from '@/components/task/TaskTodayBadge';
import { NewInTodayDot } from '@/components/task/NewInTodayDot';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { useProjectCompletion } from '@/components/project/useProjectCompletion';
import { TaskRepeatBadge } from '@/components/task/TaskRepeatBadge';
import { startOfTomorrow } from '@taskora/api';
import type { SelectionState } from '@taskora/api';

interface Props {
  /** Feed 视图传 `ProjectFeedItem`；列表页（区域页等）传 `ProjectResponseDto`。
   * 两者共享本行所需字段（title / status / 计数 / 日期 / tags）。 */
  item: ProjectFeedItem | ProjectResponseDto;
  showScheduledBadge?: ScheduledBadgeMode;
  selectionState?: SelectionState;
  /** Logbook 专用：标题后注入的了却日期徽标 */
  settledDateBadge?: React.ReactNode;
  /** Logbook 场景：已了结标题保留删除线但不置灰（正常前景色）。 */
  plainSettledTitle?: boolean;
  /** New in Today 新到条目：行首左侧黄点。 */
  newInToday?: boolean;
  /** 点击行的去向；缺省打开项目页（回顾列表改为进入回顾模式）。 */
  onOpen?: () => void;
  /** 行尾附加内容（回顾列表的间隔 / 回顾日与操作）。 */
  trailing?: React.ReactNode;
}

export function ProjectFeedRow({
  item,
  showScheduledBadge = true,
  selectionState = 'idle',
  settledDateBadge,
  plainSettledTitle = false,
  newInToday = false,
  onOpen,
  trailing,
}: Props) {
  useCalendarDay();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const completion = useProjectCompletion();
  const completed = item.status === 'COMPLETED';
  // 取消目前不属于项目模型（ADR 0006 明确 out of scope）；此分支作防御性呈现。
  const cancelled = item.status === ('CANCELLED' as ProjectStatus);
  const settled = completed || cancelled;
  const trashed = item.trashedAt !== null;

  const projectCast = item as unknown as ProjectResponseDto;

  const open = onOpen ?? (() => navigate(`/projects/${item.id}`));

  const handleToggle = () => {
    // 防御：取消的项目暂不可经此撤销（模型不支持），退化为完成切换。
    completion.toggle(item);
  };

  return (
    <ProjectContextMenu
      project={projectCast}
      current={projectCast}
      variant={trashed ? 'trash' : 'default'}
    >
      <div
        data-task-item
        data-preload-route={`/projects/${item.id}`}
        data-selection-row={item.id}
        tabIndex={selectionState !== 'idle' ? 0 : -1}
        aria-selected={selectionState !== 'idle' || undefined}
        className={cn(
          'group relative flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-accent/60 max-md:h-11',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
          selectionState !== 'idle' && 'bg-selection focus-visible:ring-0 hover:bg-selection',
        )}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        onKeyDown={(e) => {
          // Ignore keys coming from the nested progress ring button.
          if (e.target !== e.currentTarget) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          open();
        }}
        role="button"
      >
        {newInToday && !settled && <NewInTodayDot />}
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
              showScheduledBadge === true && <TaskTodayBadge className="shrink-0" />
            ) : (
              <TaskDateBadge scheduledDate={item.scheduledDate} />
            ))}
        <span
          className={cn(
            'flex-1 truncate text-left text-body font-semibold',
            settled
              ? plainSettledTitle
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
          <TaskRepeatBadge repeatRule={item.repeatRule} className="shrink-0" />
          <TaskTagCapsules tags={item.tags} />
          <TaskDueDateBadge dueDate={item.dueDate} />
          {trailing}
        </div>
      </div>
      {completion.dialog}
    </ProjectContextMenu>
  );
}
