import { useTranslation } from 'react-i18next';
import type { ProjectResponseDto } from '@taskora/shared';
import type { SelectionState } from '@taskora/api';

import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { useProjectCompletion } from '@/components/project/useProjectCompletion';
import { TaskDueDateBadge } from '@/components/task/TaskDueDateBadge';
import { GroupHeaderRowShell } from './GroupHeaderRowShell';

interface Props {
  project: ProjectResponseDto;
  selectionState?: SelectionState;
}

/** Project 分组头保留进度环、完成操作与截止徽标，标题负责导航；右键菜单不变。 */
export function ProjectGroupHeaderRow({ project, selectionState = 'idle' }: Props) {
  const { t } = useTranslation();
  const completion = useProjectCompletion();

  return (
    <ProjectContextMenu project={project} current={project}>
      <GroupHeaderRowShell
        parentId={project.id}
        selectionState={selectionState}
        to={`/projects/${project.id}`}
        title={project.title || t('project:newItemPlaceholder')}
        placeholder={!project.title}
        trailing={project.dueDate ? <TaskDueDateBadge dueDate={project.dueDate} /> : undefined}
        icon={
          <ProjectProgressRing
            total={project.taskTotalCount}
            completed={project.taskCompletedCount}
            projectStatus={project.status}
            onToggle={() => completion.toggle(project)}
          />
        }
      />
      {completion.dialog}
    </ProjectContextMenu>
  );
}
