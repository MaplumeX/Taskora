import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useCreateArea } from '@/hooks/useAreas';
import { useCreateProject } from '@/hooks/useProjects';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';

export interface CreateListNavigation {
  /** Navigate to a freshly created project's detail view. */
  navigateToProject?: (projectId: string) => void;
  /** Navigate to a freshly created area's detail view. */
  navigateToArea?: (areaId: string) => void;
}

/**
 * 新建项目 / 区域的共享逻辑（桌面侧边栏「添加」菜单、底部动作、手机首页 FAB）：
 * 以空标题创建，成功后标记自动编辑并跳到详情页，失败 toast。
 */
export function useCreateListActions(nav: CreateListNavigation) {
  const { t } = useTranslation();
  const createProject = useCreateProject();
  const createArea = useCreateArea();
  const setPendingAutoEditId = useUiInteractionStore((s) => s.setPendingAutoEditId);
  const { navigateToProject, navigateToArea } = nav;

  /** 不传 areaId 时创建不归属区域的项目。 */
  const handleNewProject = useCallback(
    (areaId?: string) => {
      createProject.mutate(
        areaId ? { title: '', areaId } : { title: '' },
        {
          onSuccess: (p) => {
            setPendingAutoEditId(p.id);
            navigateToProject?.(p.id);
          },
          onError: () => toast.error(t('common:createFailed')),
        },
      );
    },
    [createProject, setPendingAutoEditId, navigateToProject, t],
  );

  const handleNewArea = useCallback(() => {
    createArea.mutate(
      { title: '' },
      {
        onSuccess: (a) => {
          setPendingAutoEditId(a.id);
          navigateToArea?.(a.id);
        },
        onError: () => toast.error(t('common:createFailed')),
      },
    );
  }, [createArea, setPendingAutoEditId, navigateToArea, t]);

  return {
    handleNewProject,
    handleNewArea,
    newProjectPending: createProject.isPending,
    newAreaPending: createArea.isPending,
  };
}
