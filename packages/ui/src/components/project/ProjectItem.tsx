import { ChevronRight } from 'lucide-react';
import { useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { sidebarRowClass } from '@/components/layout/sidebarRowClass';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import {
  useCompleteProject,
  useUncompleteProject,
} from '@taskora/api';

interface Props {
  project: ProjectResponseDto;
  taskCount?: number;
  showChevron?: boolean;
  /** 键盘 Selection 停留在该行时高亮（Project 行仅是遍历停留点）。 */
  selected?: boolean;
  /** 列表页使用（Area 详情）：纳入 roving focus（data-selection-row +
   * 选中行作为唯一 tab 停靠点）。侧边栏不传，保持普通 tabIndex={0}
   * 行为，避免与列表页同名行冲突。 */
  selectionRow?: boolean;
  /** 侧边栏紧凑行：28px 行高、16px 进度环（与图标同宽）、当前项目高亮。 */
  variant?: 'list' | 'sidebar';
  /** 在标题前显示未来计划日期 chip（稍后项目的「计划」小节）。 */
  showScheduledBadge?: boolean;
}

export function ProjectItem({
  project,
  taskCount,
  showChevron = true,
  selected = false,
  selectionRow = false,
  variant = 'list',
  showScheduledBadge = false,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sidebar = variant === 'sidebar';
  const isCurrent = useMatch(`/projects/${project.id}`) !== null;
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();

  const isCompleted = project.status === ProjectStatus.COMPLETED;

  const handleToggle = () => {
    (isCompleted ? uncompleteProject : completeProject).mutate(project.id, {
      onError: () => toast.error(t('common:saveFailed')),
    });
  };

  return (
    <ProjectContextMenu project={project} current={project}>
      <div
        role="button"
        data-selection-row={selectionRow ? project.id : undefined}
        tabIndex={selectionRow ? (selected ? 0 : -1) : 0}
        aria-selected={selected || undefined}
        onClick={() => navigate(`/projects/${project.id}`)}
        onKeyDown={(e) => {
          // Ignore keys coming from the nested progress ring button.
          if (e.target !== e.currentTarget) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          navigate(`/projects/${project.id}`);
        }}
        className={
          sidebar
            ? sidebarRowClass(
                isCurrent,
                'w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
              )
            : cn(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover-instant hover:bg-accent/60 max-md:py-2.5',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
                selected && 'bg-selection hover:bg-selection focus-visible:ring-0',
              )
        }
      >
        <ProjectProgressRing
          size={sidebar ? 16 : 20}
          total={project.taskTotalCount}
          completed={project.taskCompletedCount}
          projectStatus={project.status}
          onToggle={handleToggle}
        />
        {showScheduledBadge && <TaskDateBadge scheduledDate={project.scheduledDate} />}
        <span className={cn(
          'flex-1 truncate',
          !sidebar && 'text-body font-semibold',
          !project.title && 'text-muted-foreground',
          isCompleted && 'text-muted-foreground',
        )}>
          {project.title || t('project:newItemPlaceholder')}
        </span>
        {typeof taskCount === 'number' && (
          <span className="text-xs text-muted-foreground">{taskCount}</span>
        )}
        {showChevron && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
    </ProjectContextMenu>
  );
}