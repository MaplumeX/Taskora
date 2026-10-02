import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { TaskResponseDto } from '@taskora/shared';
import { ScheduledType, TaskStatus } from '@taskora/shared';
import {
  currentLegacyDateTimeZone,
  i18n,
  parseCalendarDate,
  RepeatSkipBlockedError,
  skipOccurrenceDate,
  usePreferencesStore,
  useSkipTask,
} from '@taskora/api';

/**
 * 重复任务「跳过本次」（右键菜单与多选工具栏共用）。
 *
 * - `available`：仅未了结、未进 Trash 的 DATE 型重复任务提供该入口。
 * - `target`：跳过后的下一次日期；链已到头（until）时为 null，入口应禁用。
 *   仅在 `enabled`（菜单打开）时计算。「下一次已存在」需查数据，由数据层拒绝后提示。
 */
export function useSkipOccurrence(task: TaskResponseDto | null, enabled: boolean) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const skipTask = useSkipTask();
  const timeZone = usePreferencesStore((s) => s.timeZone);

  const available =
    !!task &&
    (task.scheduledType ?? ScheduledType.NONE) === ScheduledType.DATE &&
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
      onSuccess: (skipped) => {
        if (!skipped.scheduledDate) return;
        const date = new Intl.DateTimeFormat(i18n.language, {
          month: 'short',
          day: 'numeric',
          weekday: 'short',
        }).format(parseCalendarDate(skipped.scheduledDate));
        toast.success(t('skipOccurrenceDone', { date }));
      },
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

  return { available, target, skip };
}
