import { useMatch, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ProjectStatus } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';
import { sidebarContextMenuTargets, useSidebarSelectionStore } from '@taskora/api';

import { cn } from '@/lib/utils';
import { sidebarDropOverClass, sidebarRowClass } from '@/components/layout/sidebarRowClass';
import { ProjectContextMenu } from '@/components/project/ProjectContextMenu';
import { ProjectProgressRing } from '@/components/project/ProjectProgressRing';
import { useProjectCompletion } from '@/components/project/useProjectCompletion';
import { isAppleOS } from '@/components/keyboard/keymap';

interface Props {
  project: ProjectResponseDto;
  /** 被拖条目悬停在此行上且可放下（Sidebar Drop）。 */
  dropOver?: boolean;
}

/**
 * 侧边栏紧凑项目行（Things 3 式）：28px 行高、16px 进度环（与图标同宽）、
 * 当前项目高亮。列表页（区域页 / Later Projects 页）改用 `ProjectFeedRow`，
 * 该组件只服务侧边栏。
 */
export function ProjectItem({ project, dropOver = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isCurrent = useMatch(`/projects/${project.id}`) !== null;
  const currentProjectId = useMatch('/projects/:id')?.params.id ?? null;
  // 侧边栏多选中时高亮跟随多选，否则跟随当前路由。
  const selected = useSidebarSelectionStore((s) =>
    s.ids.length > 0 ? s.ids.includes(project.id) : null,
  );
  const completion = useProjectCompletion();

  const isCompleted = project.status === ProjectStatus.COMPLETED;

  const handleToggle = () => {
    completion.toggle(project);
  };

  return (
    <ProjectContextMenu project={project} current={project} targetsOf={sidebarContextMenuTargets}>
      <div
        role="button"
        data-preload-route={`/projects/${project.id}`}
        data-sidebar-nav={`/projects/${project.id}`}
        tabIndex={0}
        onMouseDown={(e) => {
          // ⇧+点击是范围多选，不让浏览器顺带框选文字。
          if (e.shiftKey) e.preventDefault();
        }}
        onClick={(e) => {
          // 多选（对齐 Things 3 Mac）：⌘/Ctrl+点击切换、⇧+点击范围，只改选中、不导航。
          const selection = useSidebarSelectionStore.getState();
          if (e.shiftKey) {
            selection.extendTo(project.id, currentProjectId);
            return;
          }
          if (isAppleOS() ? e.metaKey : e.ctrlKey) {
            selection.toggle(project.id, currentProjectId);
            return;
          }
          selection.clear();
          navigate(`/projects/${project.id}`);
        }}
        onKeyDown={(e) => {
          // Ignore keys coming from the nested progress ring button.
          if (e.target !== e.currentTarget) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          navigate(`/projects/${project.id}`);
        }}
        className={sidebarRowClass(
          selected ?? isCurrent,
          cn(
            'w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40',
            dropOver && sidebarDropOverClass,
          ),
        )}
      >
        <ProjectProgressRing
          size={16}
          total={project.taskTotalCount}
          completed={project.taskCompletedCount}
          projectStatus={project.status}
          start={project.start}
          onToggle={handleToggle}
        />
        <span
          className={cn(
            'flex-1 truncate',
            !project.title && 'text-muted-foreground',
            isCompleted && 'text-muted-foreground',
          )}
        >
          {project.title || t('project:newItemPlaceholder')}
        </span>
      </div>
      {completion.dialog}
    </ProjectContextMenu>
  );
}
