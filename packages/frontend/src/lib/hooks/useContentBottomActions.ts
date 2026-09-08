import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { CreateTaskDto } from '@taskora/shared';

import { useCreateProject, useProjectsQuery } from '@/lib/hooks/useProjects';
import { useCreateTask } from '@/lib/hooks/useTasks';
import { useCreateProjectHeading } from '@/lib/hooks/useProjectHeadings';
import { usePageTaskContext } from '@/lib/hooks/usePageTaskContext';
import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { useAreasQuery } from '@/lib/hooks/useAreas';

const HIDE_ADD_TASK_ROUTES = ['/upcoming', '/calendar', '/logbook', '/trash'];

/**
 * 底部操作栏（桌面 ContentBottomBar / 手机 MobileFab）共享的添加动作逻辑：
 * 按当前路由决定各按钮显隐，并封装空标题创建任务/项目/标题 + 自动编辑跳转。
 * toast 错误提示留在本 hook 内（与原 ContentBottomBar 行为一致）。
 */
export function useContentBottomActions() {
  const { t } = useTranslation();
  const createTask = useCreateTask();
  const createProject = useCreateProject();
  const createHeading = useCreateProjectHeading();
  const ctx = usePageTaskContext();
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);
  const setPendingAutoEditId = useUiInteractionStore((s) => s.setPendingAutoEditId);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { id: routeId } = useParams<{ id: string }>();
  const { data: areas } = useAreasQuery();
  const { data: projects } = useProjectsQuery();

  const showAddTask = !HIDE_ADD_TASK_ROUTES.includes(pathname);

  // 仅在当前 area 存在时才显示添加项目按钮
  const isAreaDetail = pathname.startsWith('/areas/') && !!routeId;
  const areaExists = areas?.some((a) => a.id === routeId) ?? false;
  const showAddProject = isAreaDetail && areaExists;
  const isProjectDetail = pathname.startsWith('/projects/') && !!routeId;
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
          navigate(`/projects/${p.id}`);
        },
        onError: () => toast.error(t('common:createFailed')),
      },
    );
  }, [routeId, createProject, setPendingAutoEditId, navigate, t]);

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
