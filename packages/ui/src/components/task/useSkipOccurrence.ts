import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';
import { TaskStatus } from '@taskora/shared';
import {
  currentLegacyDateTimeZone,
  RepeatSkipBlockedError,
  skipOccurrenceDate,
  usePreferencesStore,
  useSkipTask,
} from '@taskora/api';

/**
 * 重复任务「跳过本次」（右键菜单与多选工具栏共用）。
 *
 * - `available`：仅未了结、未进 Trash 的 DATE 型重复任务提供该入口。
 * - `target`：跳过后的下一次日期；仅在 `enabled`（菜单打开）时计算。
 * - `last`：已是最后一次（链在下一次之前终结）。跳过即取消任务、结束重复
 *   （recurring-tasks-v3），入口仍可用，文案换成「跳过本次并结束重复」。
 * 「下一次已存在」需查数据，由数据层拒绝后提示。
 */
export function useSkipOccurrence(task: TaskResponseDto | null, enabled: boolean) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const skipTask = useSkipTask();
  const timeZone = usePreferencesStore((s) => s.timeZone);

  const available =
    !!task &&
    task.scheduledDate != null &&
    !!task.repeatRule &&
    task.status === TaskStatus.ACTIVE &&
    !task.trashedAt;
  const repeatRule = task?.repeatRule;
  const scheduledDate = task?.scheduledDate ?? null;
  const target = React.useMemo(
    () =>
      enabled && available && repeatRule
        ? skipOccurrenceDate(repeatRule, {
            scheduledDate,
            now: new Date(),
            timeZone,
            legacyDateTimeZone: currentLegacyDateTimeZone(),
          })
        : null,
    [enabled, available, repeatRule, scheduledDate, timeZone],
  );

  const skip = () => {
    if (!task) return;
    skipTask.mutate(task.id, {
      onError: (error) =>
        toast.error(
          error instanceof RepeatSkipBlockedError && error.reason === 'next-exists'
            ? t('skipOccurrenceNextExists')
            : error instanceof RepeatSkipBlockedError && error.reason === 'no-next'
              ? t('skipOccurrenceLast')
              : tc('saveFailed'),
        ),
    });
  };

  const last = enabled && available && target === null;

  return { available, target, last, skip };
}
