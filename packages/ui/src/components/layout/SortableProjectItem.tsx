import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';

import type { ProjectResponseDto } from '@taskora/shared';

import { ProjectItem } from '@/components/project/ProjectItem';
import { projectDndId } from '@/components/layout/sidebarProjectLayout';
import { flipId, noLayoutAnimation } from '../../lib/dnd';
import { useSidebarDropTarget } from '../../lib/appDnd';

interface Props {
  project: ProjectResponseDto;
  placeholder?: boolean;
  /** 作为 Sidebar Drop 落点（任务拖到项目上 = 移入该项目）。 */
  dropTarget?: boolean;
}

/**
 * 侧边栏可拖拽项目条目包装。
 *
 * - sortable id 采用 `proj:<projectId>` 前缀，与区域条目 (`area:<id>`) 区分。
 * - listeners 挂在外层 div 而非 ProjectItem 的点击区域上，配合鼠标
 *   distance:5 / 触摸 delay:300 的激活约束，保留点击导航行为。
 * - 项目拖拽走实时预览：布局随指针重排，位移由 FLIP 动画承担，不叠加
 *   dnd-kit 的排序位移（见 lib/dnd.ts）。被拖项目在列表里保留为不可见
 *   的真实行，空位高度与行高一致。
 */
export function SortableProjectItem({ project, placeholder = false, dropTarget = false }: Props) {
  const { attributes, listeners, setNodeRef } = useSortable({
    id: projectDndId(project.id),
    animateLayoutChanges: noLayoutAnimation,
  });
  const drop = useSidebarDropTarget(
    dropTarget ? { kind: 'project', projectId: project.id } : null,
  );
  const setRefs = React.useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      drop.setNodeRef(node);
    },
    [setNodeRef, drop.setNodeRef],
  );

  return (
    <div
      ref={setRefs}
      data-sortable-project-id={project.id}
      {...flipId(projectDndId(project.id))}
      {...attributes}
      {...listeners}
    >
      {placeholder ? (
        <div
          data-testid={`project-placeholder-${project.id}`}
          className="invisible"
          aria-hidden="true"
        >
          <ProjectItem project={project} />
        </div>
      ) : (
        <ProjectItem project={project} dropOver={drop.isOver} />
      )}
    </div>
  );
}
