import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
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
}

export function ProjectItem({
  project,
  taskCount,
  showChevron = true,
  selected = false,
  selectionRow = false,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-left hover-instant hover:bg-accent max-md:py-2.5',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
          selected && 'bg-accent focus-visible:ring-0',
        )}
      >
        <ProjectProgressRing
          total={project.taskTotalCount}
          completed={project.taskCompletedCount}
          projectStatus={project.status}
          onToggle={handleToggle}
        />
        <span className={cn(
          'flex-1 truncate text-sm',
          !project.title && 'text-muted-foreground',
          isCompleted && 'text-muted-foreground line-through',
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