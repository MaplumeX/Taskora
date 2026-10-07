import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  getTasks,
  todayDateKey,
  useCompleteTask,
  useDeleteProject,
  useDeleteTask,
  useProjectsQuery,
  useReorderProjects,
  useReorderTasks,
  useSelectionStore,
  useUpdateProject,
  useUpdateTask,
} from '@taskora/api';

import { AppDndProvider } from '../../lib/appDnd';
import { useProjectCompletion } from '@/components/project/useProjectCompletion';
import {
  planSidebarDrop,
  projectOrderLastInArea,
  taskOrderLastInProject,
  type SidebarDropPayload,
  type SidebarDropTarget,
} from './sidebarDrop';

/**
 * 应用壳的拖拽上下文（ADR 0018）+ Sidebar Drop 的执行：落点规划出的动作
 * 走与右键菜单 / 选择器相同的 mutation（重复任务派生、项目剩余任务询问、
 * 提醒改写等都由既有路径负责）。松手后停留在当前页、清空 Selection，
 * 没有 toast 与撤销。
 */
export function SidebarDropProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();
  const updateProject = useUpdateProject();
  const reorderProjects = useReorderProjects();
  const reorderTasks = useReorderTasks();
  const deleteProject = useDeleteProject();
  const completion = useProjectCompletion();
  const { data: projects = [] } = useProjectsQuery();

  const handleDrop = (payload: SidebarDropPayload, target: SidebarDropTarget) => {
    // 项目以最新数据规划（进度计数用于剩余任务询问）。
    const project =
      payload.kind === 'project'
        ? projects.find((entry) => entry.id === payload.project.id)
        : undefined;
    const actions = planSidebarDrop(
      project ? { kind: 'project', project } : payload,
      target,
      todayDateKey(),
    );
    if (actions === null) return;
    useSelectionStore.getState().clearSelection();

    const onError = () => toast.error(t('common:saveFailed'));
    // 移入项目：全部写完后排到项目无 Heading 部分末尾（同组按落下顺序）。
    const intoProject = target.kind === 'project' ? target.projectId : null;
    const movedIds = actions.flatMap((action) => (action.type === 'updateTask' ? [action.id] : []));
    let pendingMoves = movedIds.length;
    const placeMovedTasks = () => {
      pendingMoves -= 1;
      if (pendingMoves > 0 || !intoProject) return;
      void getTasks({ projectId: intoProject }).then((tasks) => {
        const order = taskOrderLastInProject(tasks, movedIds);
        if (order) reorderTasks.mutate(order, { onError });
      }, onError);
    };
    for (const action of actions) {
      switch (action.type) {
        case 'updateTask':
          updateTask.mutate(
            { id: action.id, data: action.data },
            { onError, onSuccess: placeMovedTasks },
          );
          break;
        case 'completeTask':
          completeTask.mutate(action.id, { onError });
          break;
        case 'deleteTask':
          deleteTask.mutate(action.id, { onError: () => toast.error(t('task:deleteFailed')) });
          break;
        case 'updateProject':
          updateProject.mutate({ id: action.id, data: action.data }, { onError });
          break;
        case 'moveProjectToArea': {
          const order = projectOrderLastInArea(projects, action.id, action.areaId);
          updateProject.mutate(
            { id: action.id, data: { areaId: action.areaId } },
            { onError, onSuccess: () => order && reorderProjects.mutate(order, { onError }) },
          );
          break;
        }
        case 'completeProject':
          if (project) completion.toggle(project);
          break;
        case 'deleteProject':
          deleteProject.mutate(action.id, { onError: () => toast.error(t('common:deleteFailed')) });
          break;
      }
    }
  };

  return (
    <AppDndProvider onSidebarDrop={handleDrop}>
      {children}
      {completion.dialog}
    </AppDndProvider>
  );
}
