import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { getTask } from '@taskora/api';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * 「转换为项目」前的附件确认（ADR-0019）：转换会物理删除原任务，附件随之
 * 删除（Project 不能带附件）。任务有附件时先确认，没有则直接执行。列表行
 * 上的 DTO 不一定带附件，所以先读一次任务详情。
 */
export function useConvertGuard() {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<{ count: number; run: () => void } | null>(null);

  const guard = React.useCallback(async (taskId: string, run: () => void) => {
    const count = (await getTask(taskId).catch(() => null))?.attachments?.length ?? 0;
    if (count === 0) run();
    else setPending({ count, run });
  }, []);

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('task:convertToProject')}</DialogTitle>
          <DialogDescription>
            {t('task:convertWithAttachments', { count: pending?.count ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t('common:cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              pending?.run();
              setPending(null);
            }}
          >
            {t('task:convertToProject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { guard, dialog };
}
