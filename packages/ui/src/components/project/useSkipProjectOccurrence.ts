import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { ProjectResponseDto } from '@taskora/shared';
import { ProjectStatus, ScheduledType } from '@taskora/shared';
import {
  currentLegacyDateTimeZone,
  i18n,
  parseCalendarDate,
  RepeatSkipBlockedError,
  skipOccurrenceDate,
  usePreferencesStore,
  useSkipProject,
} from '@taskora/api';

/**
 * 重复项目「跳过本次」（recurring-projects spec，口径同任务的
 * useSkipOccurrence）。
 *
 * - `available`：仅未完成、未进 Trash 的 DATE 型重复项目提供该入口。
 * - `target`：跳过后的下一次日期；链已到头（until）时为 null，入口应禁用。
 *   仅在 `enabled`（菜单打开）时计算。「下一次已存在」需查数据，由数据层拒绝后提示。
 */
export function useSkipProjectOccurrence(project: ProjectResponseDto, enabled: boolean) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const skipProject = useSkipProject();
  const timeZone = usePreferencesStore((s) => s.timeZone);

  const available =
    (project.scheduledType ?? ScheduledType.NONE) === ScheduledType.DATE &&
    !!project.repeatRule &&
    project.status === ProjectStatus.ACTIVE &&
    !project.trashedAt;
  const repeatRule = project.repeatRule;
  const scheduledDate = project.scheduledDate ?? null;
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
    skipProject.mutate(project.id, {
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
