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
 * 「转换为项目」前的二次确认：转换会物理删除原任务、无法撤销（ADR-0024）。
 * 任务有附件时文案提示附件随之删除（ADR-0019，Project 不能带附件）。列表行
 * 上的 DTO 不一定带附件，所以先读一次任务详情。
 */
export function useConvertGuard() {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<{ count: number; run: () => void } | null>(null);

  const guard = React.useCallback(async (taskId: string, run: () => void) => {
    const count = (await getTask(taskId).catch(() => null))?.attachments?.length ?? 0;
    setPending({ count, run });
  }, []);

  // 关闭动画期间 pending 已清空，沿用上一次的附件数，免得文案闪回。
  const countRef = React.useRef(0);
  if (pending) countRef.current = pending.count;
  const count = countRef.current;

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{t('task:convertToProject')}</DialogTitle>
          <DialogDescription>
            {count > 0 ? t('task:convertWithAttachments', { count }) : t('task:convertConfirm')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t('common:cancel')}
          </Button>
          <Button
            variant={count > 0 ? 'destructive' : 'default'}
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
