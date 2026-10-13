import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useLoggingActions, useLoggingMode } from '@taskora/api';

/**
 * Log Completed（CONTEXT：Log Completed）：把所有 Unlogged Item 一次移入
 * Logbook，可撤销（撤销历史）。立即模式下没有可移入的条目，available 为
 * false，各入口隐藏。
 */
export function useLogCompleted(): { available: boolean; run: () => void } {
  const { t } = useTranslation('common');
  const { logCompleted } = useLoggingActions();
  const available = useLoggingMode() !== 'IMMEDIATE';
  const run = useCallback(() => {
    logCompleted().catch(() => toast.error(t('operationFailed')));
  }, [logCompleted, t]);
  return { available, run };
}
