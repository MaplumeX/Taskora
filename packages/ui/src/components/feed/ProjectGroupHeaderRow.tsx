import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { TaskDateBadge } from '@/components/task/TaskDateBadge';
import { TaskDueDateBadge } from '@/components/task/TaskDueDateBadge';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { GroupHeaderRowShell } from './GroupHeaderRowShell';
import { useCompleteProject, useUncompleteProject } from '@taskora/api';
import type { SelectionState } from '@taskora/api';

interface Props {
  project: ProjectResponseDto;
  collapsed: boolean;
  onToggleCollapse: () => void;
  selectionState?: SelectionState;
}

/**
 * Grouped View 的项目 Group Header（分组头）：chevron + 进度环（含完成/
 * 取消完成）+ 标题 + 计划/到期徽章 + 项目级全局计数。点击行体进入项目
 * 详情；保留 ProjectContextMenu。
 */
export function ProjectGroupHeaderRow({
  project,
  collapsed,
  onToggleCollapse,
  selectionState = 'idle',
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();
  const completed = project.status === ProjectStatus.COMPLETED;
  const label = project.title || t('project:newItemPlaceholder');

  const handleToggle = () => {
    (completed ? uncompleteProject : completeProject).mutate(project.id, {
      onError: () => toast.error(t('common:saveFailed')),
    });
  };

  return (
    <ProjectContextMenu project={project} current={project}>
      <GroupHeaderRowShell
        parentId={project.id}
        label={label}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
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
            'flex-1 truncate text-left text-sm font-medium',
            completed
              ? 'text-muted-foreground line-through'
              : project.title
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <div className="flex items-center gap-2">
          {project.taskTotalCount > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {project.taskCompletedCount}/{project.taskTotalCount}
            </span>
          )}
          <TaskDateBadge scheduledDate={project.scheduledDate} />
          <TaskDueDateBadge dueDate={project.dueDate} />
        </div>
      </GroupHeaderRowShell>
    </ProjectContextMenu>
  );
}
