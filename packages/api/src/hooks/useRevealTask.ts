import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { currentTaskBackend } from '@/api/task-backend';
import { useTaskRevealStore } from '@/stores/taskReveal.store';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { revealRouteFor } from '@/utils/revealRoute';

/**
 * Reveal Task（reminder-actions spec）：导航到最能容纳该任务的视图并
 * 展开它、滚入视野。任务不存在或已进 Trash 时不导航，返回 false。
 * allowTrash（Quick Find 的继续搜索）：Trash 中的任务导航到 Trash，同样
 * 展开该行。
 */
export function useRevealTask(): (
  taskId: string,
  options?: { allowTrash?: boolean },
) => Promise<boolean> {
  const navigate = useNavigate();
  return useCallback(
    async (taskId: string, options?: { allowTrash?: boolean }) => {
      let route: string | null;
      try {
        route = revealRouteFor(await currentTaskBackend().getTask(taskId), {
          allowTrash: options?.allowTrash,
        });
      } catch {
        return false; // 任务不存在（已删除 / 尚未同步到本机）
      }
      if (route === null) return false;
      const ui = useUiInteractionStore.getState();
      // 覆盖在列表之上的浮层会挡住目标行
      ui.closeSettings();
      ui.setSearchOpen(false);
      ui.setExpandedId(taskId);
      ui.setRevealId(taskId);
      navigate(route);
      return true;
    },
    [navigate],
  );
}

/** 在 Router 内常驻：取走平台壳投递的 Reveal 请求并执行。 */
export function useTaskRevealListener(): void {
  const reveal = useRevealTask();
  const pendingTaskId = useTaskRevealStore((s) => s.pendingTaskId);
  useEffect(() => {
    if (pendingTaskId === null) return;
    const taskId = useTaskRevealStore.getState().take();
    if (taskId !== null) void reveal(taskId);
  }, [pendingTaskId, reveal]);
}
