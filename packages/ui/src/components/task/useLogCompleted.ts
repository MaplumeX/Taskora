import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useLoggingActions, useLoggingMode } from '@taskora/api';

/**
 * Log Completed（CONTEXT：Log Completed）：把所有 Unlogged Item 一次移入
 * Logbook，toast 带撤销。立即模式下没有可移入的条目，available 为 false，
 * 各入口隐藏。
 */
export function useLogCompleted(): { available: boolean; run: () => void } {
  const { t } = useTranslation(['task', 'common']);
  const { logCompleted } = useLoggingActions();
  const available = useLoggingMode() !== 'IMMEDIATE';
  const run = useCallback(() => {
    const failed = () => toast.error(t('common:operationFailed'));
    logCompleted().then((undo) => {
      if (!undo) return;
      toast(t('task:logCompletedDone'), {
        action: { label: t('common:undo'), onClick: () => void undo().catch(failed) },
      });
    }, failed);
  }, [logCompleted, t]);
  return { available, run };
}
