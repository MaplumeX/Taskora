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
  const [pending, setPending] = React.useState<{ id: string; remaining: number } | null>(null);

  const onError = () => toast.error(tc('saveFailed'));

  const toggle = (project: CompletableProject) => {
    if (project.status === ProjectStatus.COMPLETED) {
      uncompleteProject.mutate(project.id, { onError });
      return;
    }
    // 进度计数：total 为未进 Trash 的任务，completed 为其中已了结的
    const remaining = project.taskTotalCount - project.taskCompletedCount;
    if (remaining > 0) {
      setPending({ id: project.id, remaining });
      return;
    }
    completeProject.mutate(project.id, { onError });
  };

  const settle = (settleRemaining: SettleRemainingTasks) => {
    if (!pending) return;
    completeProject.mutate({ id: pending.id, settleRemaining }, { onError });
    setPending(null);
  };

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('completeRemainingTitle')}</DialogTitle>
          <DialogDescription>
            {t('completeRemainingDescription', { count: pending?.remaining ?? 0 })}
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

  return { toggle, dialog };
}
