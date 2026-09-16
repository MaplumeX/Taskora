import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { CreateTaskDto } from '@taskora/shared';

import { useCreateProject, useProjectsQuery } from '@/hooks/useProjects';
import { useCreateTask } from '@/hooks/useTasks';
import { useCreateProjectHeading } from '@/hooks/useProjectHeadings';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { useAreasQuery } from '@/hooks/useAreas';

/** Views where the "add task" action must not appear. */
/** 不显示「添加任务」的视图（agent 有自己的聊天输入框，底部动作不适用） */
const HIDE_ADD_TASK_VIEWS = ['upcoming', 'calendar', 'logbook', 'trash', 'agent'];

/** Route context supplied by the host navigation shell. */
export interface BottomActionsRouteContext {
  /** Current logical view id (e.g. 'today', 'projects', 'areas'). */
  view: string;
  /** Current route param (`:id` of the area/project detail page, if any). */
  routeId?: string;
  /** Partial CreateTaskDto for the current page (bucket/project/area/tags). */
  createTaskContext: Omit<Partial<CreateTaskDto>, 'title'>;
  /** Navigate to a freshly created project's detail view. */
  navigateToProject?: (projectId: string) => void;
}

/**
 * 底部操作栏（桌面 ContentBottomBar / 手机 MobileFab）共享的添加动作逻辑：
 * 按当前视图决定各按钮显隐，并封装空标题创建任务/项目/标题 + 自动编辑。
 * 路由上下文由宿主（web router / desktop shell）通过参数注入，
 * toast 错误提示留在本 hook 内（与原 ContentBottomBar 行为一致）。
 */
export function useContentBottomActions(route: BottomActionsRouteContext) {
  const { t } = useTranslation();
  const createTask = useCreateTask();
  const createProject = useCreateProject();
  const createHeading = useCreateProjectHeading();
  const ctx = route.createTaskContext;
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);
  const setPendingAutoEditId = useUiInteractionStore((s) => s.setPendingAutoEditId);
  const { data: areas } = useAreasQuery();
  const { data: projects } = useProjectsQuery();

  const view = route.view;
  const routeId = route.routeId;
  const showAddTask = !HIDE_ADD_TASK_VIEWS.includes(view);

  // 仅在当前 area 存在时才显示添加项目按钮
  const isAreaDetail = view === 'areas' && !!routeId;
  const areaExists = areas?.some((a) => a.id === routeId) ?? false;
  const showAddProject = isAreaDetail && areaExists;
  const isProjectDetail = view === 'projects' && !!routeId;
  const projectExists = projects?.some((project) => project.id === routeId) ?? false;
  const showAddHeading = isProjectDetail && projectExists;

  const handleAddTask = useCallback(() => {
    const payload: CreateTaskDto = { title: '', ...ctx };
    createTask.mutate(payload, {
      onSuccess: (created) => {
        setExpandedId(created.id);
      },
      onError: () => toast.error(t('common:createFailed')),
    });
  }, [ctx, createTask, setExpandedId, t]);

  const handleAddProject = useCallback(() => {
    if (!routeId) return;
    createProject.mutate(
      { title: '', areaId: routeId },
      {
        onSuccess: (p) => {
          setPendingAutoEditId(p.id);
          route.navigateToProject?.(p.id);
        },
        onError: () => toast.error(t('common:createFailed')),
      },
    );
  }, [routeId, createProject, setPendingAutoEditId, route, t]);

  const handleAddHeading = useCallback(() => {
    if (!routeId) return;
    createHeading.mutate(
      { projectId: routeId, title: '' },
      {
        onSuccess: (heading) => setPendingAutoEditId(heading.id),
        onError: () => toast.error(t('project:createHeadingFailed')),
      },
    );
  }, [routeId, createHeading, setPendingAutoEditId, t]);

  return {
    showAddTask,
    showAddProject,
    showAddHeading,
    handleAddTask,
    handleAddProject,
    handleAddHeading,
    addTaskPending: createTask.isPending,
    addProjectPending: createProject.isPending,
    addHeadingPending: createHeading.isPending,
  };
}
