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
import type {
  ScheduledFieldCurrent,
  ScheduledFieldPatch,
} from '@/components/task/fields/fieldProps';
import { ScheduledDateField } from '@/components/task/fields/ScheduledDateField';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  planSidebarDrop,
  projectOrderLastInArea,
  taskOrderLastInProject,
  type SidebarDropPayload,
  type SidebarDropTarget,
} from './sidebarDrop';

/** 执行一次「放到落点」（不需要锚点的落点：Inbox / Today / Anytime / Someday / 区域 / 项目等）。 */
export type SidebarDropExecutor = (payload: SidebarDropPayload, target: SidebarDropTarget) => void;

const SidebarDropExecutorContext = React.createContext<SidebarDropExecutor | null>(null);

/**
 * 键盘的「把复制的条目移到这里」（⌥⌘V）与粘贴副本落位复用 Sidebar Drop 的
 * 规划与执行（已在目标处的跳过、移入项目排到末尾、项目移入区域排到末尾）。
 * 不在 SidebarDropProvider 内时为 null。
 */
export function useSidebarDropExecutor(): SidebarDropExecutor | null {
  return React.useContext(SidebarDropExecutorContext);
}

/** 落在「计划」上：在该行旁弹出计划日期卡片，选定后写给被拖的条目。 */
interface SchedulePick {
  anchor: HTMLElement;
  current: ScheduledFieldCurrent;
  apply: (patch: ScheduledFieldPatch) => void;
}

/**
 * 应用壳的拖拽上下文（ADR 0018）+ Sidebar Drop 的执行：落点规划出的动作
 * 走与右键菜单 / 选择器相同的 mutation（重复任务派生、项目剩余任务询问、
 * 提醒改写等都由既有路径负责）。松手后停留在当前页、清空 Selection，
 * 没有 toast 与撤销。落在「计划」上条目不动，弹出计划日期卡片（同右键
 * 菜单的「计划」）。
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
  const [schedulePick, setSchedulePick] = React.useState<SchedulePick | null>(null);

  const handleDrop = (
    payload: SidebarDropPayload,
    target: SidebarDropTarget,
    anchor: HTMLElement | null,
  ) => {
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
        case 'pickTaskSchedule': {
          if (!anchor) break;
          const ids = action.ids;
          // 整组时卡片不预选任何值（各任务取值不一，同右键菜单）。
          const only = payload.kind === 'tasks' && ids.length === 1 ? payload.tasks[0] : null;
          setSchedulePick({
            anchor,
            current: only ?? {},
            apply: (data) => {
              for (const id of ids) updateTask.mutate({ id, data }, { onError });
            },
          });
          break;
        }
        case 'pickProjectSchedule':
          if (!anchor) break;
          setSchedulePick({
            anchor,
            current: project ?? {},
            apply: (data) => updateProject.mutate({ id: action.id, data }, { onError }),
          });
          break;
      }
    }
  };

  const handleDropRef = React.useRef(handleDrop);
  handleDropRef.current = handleDrop;
  const execute = React.useCallback<SidebarDropExecutor>(
    (payload, target) => handleDropRef.current(payload, target, null),
    [],
  );

  return (
    <AppDndProvider onSidebarDrop={handleDrop}>
      <SidebarDropExecutorContext.Provider value={execute}>
        {children}
      </SidebarDropExecutorContext.Provider>
      {completion.dialog}
      <Popover open={schedulePick !== null} onOpenChange={(open) => !open && setSchedulePick(null)}>
        {schedulePick && <PopoverAnchor virtualRef={{ current: schedulePick.anchor }} />}
        <PopoverContent side="right" align="start">
          {schedulePick && (
            <ScheduledDateField
              current={schedulePick.current}
              onPatch={schedulePick.apply}
              onClose={() => setSchedulePick(null)}
            />
          )}
        </PopoverContent>
      </Popover>
    </AppDndProvider>
  );
}
