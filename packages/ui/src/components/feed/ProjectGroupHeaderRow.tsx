import { useCalendarDay, parseCalendarDate, startOfTomorrow } from '@taskora/api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { TaskDueDateBadge } from '@/components/task/TaskDueDateBadge';
import { TaskTodayBadge } from '@/components/task/TaskTodayBadge';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { useProjectCompletion } from '@/components/project/useProjectCompletion';
import { TaskRepeatBadge } from '@/components/task/TaskRepeatBadge';
import { GroupHeaderRowShell } from './GroupHeaderRowShell';
import type { SelectionState } from '@taskora/api';

interface Props {
  project: ProjectResponseDto;
  selectionState?: SelectionState;
}

/**
 * Grouped View 的项目 Group Header（分组头）：下横线小节标题形态，
 * 进度环（含完成/取消完成）+ 标题 + 计划/到期徽章。点击行体进入项目
 * 详情；保留 ProjectContextMenu。无折叠按钮、无任务计数。
 */
export function ProjectGroupHeaderRow({ project, selectionState = 'idle' }: Props) {
  useCalendarDay();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const completion = useProjectCompletion();
  const completed = project.status === ProjectStatus.COMPLETED;
  const label = project.title || t('project:newItemPlaceholder');

  const handleToggle = () => {
    completion.toggle(project);
  };

  return (
    <ProjectContextMenu project={project} current={project}>
      <GroupHeaderRowShell
        parentId={project.id}
        selectionState={selectionState}
        onOpen={() => navigate(`/projects/${project.id}`)}
      >
        <ProjectProgressRing
          total={project.taskTotalCount}
          completed={project.taskCompletedCount}
          projectStatus={project.status}
          onToggle={handleToggle}
        />
        <span
          className={cn(
            'flex-1 truncate text-left text-body font-semibold',
            completed
              ? 'text-muted-foreground'
              : project.title
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <div className="flex items-center gap-2">
          <TaskRepeatBadge repeatRule={project.repeatRule} className="shrink-0" />
          {project.scheduledDate && parseCalendarDate(project.scheduledDate) < startOfTomorrow() ? (
            <TaskTodayBadge />
          ) : (
            <TaskDateBadge scheduledDate={project.scheduledDate} />
          )}
          <TaskDueDateBadge dueDate={project.dueDate} />
        </div>
      </GroupHeaderRowShell>
      {completion.dialog}
    </ProjectContextMenu>
  );
}
