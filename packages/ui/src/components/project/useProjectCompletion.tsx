import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useCompleteProject, useUncompleteProject } from '@taskora/api';
import { ProjectStatus, type SettleRemainingTasks } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface CompletableProject {
  id: string;
  status: string;
  taskTotalCount: number;
  taskCompletedCount: number;
}

/**
 * 项目完成 / 取消完成（各入口共用，recurring-projects spec）。完成仍有
 * 未了结任务的项目时先询问剩余任务标记为完成还是取消（Things 3 行为），
 * 没有剩余任务时直接完成。调用方渲染返回的 `dialog`。
 */
export function useProjectCompletion() {
  const { t } = useTranslation('project');
  const { t: tc } = useTranslation('common');
  const completeProject = useCompleteProject();
  const uncompleteProject = useUncompleteProject();
  /** 待询问剩余任务的项目（整组完成时可为多个）及其未了结任务总数。 */
  const [pending, setPending] = React.useState<{ ids: string[]; remaining: number } | null>(null);

  const onError = () => toast.error(tc('saveFailed'));

  const toggle = (project: CompletableProject) => {
    if (project.status === ProjectStatus.COMPLETED) {
      uncompleteProject.mutate(project.id, { onError });
      return;
    }
    // 进度计数：total 为未进 Trash 的任务，completed 为其中已了结的
    const remaining = project.taskTotalCount - project.taskCompletedCount;
    if (remaining > 0) {
      setPending({ ids: [project.id], remaining });
      return;
    }
    completeProject.mutate(project.id, { onError });
  };

  /**
   * 整组完成 / 取消完成（侧边栏多选）：全部已完成时取消完成，否则只完成其中
   * 未完成的；有剩余任务的项目合并询问一次，没有的直接完成。
   */
  const toggleGroup = (projects: CompletableProject[]) => {
    if (projects.every((project) => project.status === ProjectStatus.COMPLETED)) {
      for (const project of projects) uncompleteProject.mutate(project.id, { onError });
      return;
    }
    const withRemaining: string[] = [];
    let remaining = 0;
    for (const project of projects) {
      if (project.status === ProjectStatus.COMPLETED) continue;
      const count = project.taskTotalCount - project.taskCompletedCount;
      if (count > 0) {
        withRemaining.push(project.id);
        remaining += count;
      } else {
        completeProject.mutate(project.id, { onError });
      }
    }
    if (withRemaining.length > 0) setPending({ ids: withRemaining, remaining });
  };

  const settle = (settleRemaining: SettleRemainingTasks) => {
    if (!pending) return;
    for (const id of pending.ids) completeProject.mutate({ id, settleRemaining }, { onError });
    setPending(null);
  };

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('completeRemainingTitle')}</DialogTitle>
          <DialogDescription>
            {t(
              (pending?.ids.length ?? 0) > 1
                ? 'completeRemainingGroupDescription'
                : 'completeRemainingDescription',
              { count: pending?.remaining ?? 0 },
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {tc('cancel')}
          </Button>
          <Button variant="outline" onClick={() => settle('cancelled')}>
            {t('cancelRemaining')}
          </Button>
          <Button onClick={() => settle('completed')}>{t('completeRemaining')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { toggle, toggleGroup, dialog };
}
