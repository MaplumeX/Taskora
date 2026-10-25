import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ProjectStatus, TaskStatus, type RepeatRule } from '@taskora/shared';
import {
  currentLegacyDateTimeZone,
  nextOccurrenceDate,
  parseCalendarDate,
  RepeatSkipBlockedError,
  useCreateNextCopy,
  useCreateProjectNextCopy,
  usePreferencesStore,
} from '@taskora/api';

/** 提前生成下一份需要的条目字段（Task 与 Project 的响应 DTO 均满足）。 */
export interface NextCopySource {
  id: string;
  status: string;
  trashedAt: string | null;
  scheduledDate: string | null;
  occurrenceDate?: string | null;
  repeatRule?: RepeatRule | null;
}

/**
 * 「提前生成下一份」（recurring-tasks-v4，对齐 Things 3.23 的 Create Next
 * Copy）：任务与项目的菜单共用。
 *
 * - `available`：未了结、未进 Trash 的 DATE 型重复条目，且链在下一次之前
 *   没有终结（终结时不提供入口）；仅在 `enabled`（菜单打开）时计算。
 * - `target`：下一份的计划日期（anchor=completion 按今天推算）。
 * 「下一份已存在」需查数据，由数据层拒绝后提示。
 */
export function useNextCopy(
  item: NextCopySource | null,
  kind: 'task' | 'project',
  enabled: boolean,
) {
  const { t, i18n } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const createTaskCopy = useCreateNextCopy();
  const createProjectCopy = useCreateProjectNextCopy();
  const timeZone = usePreferencesStore((s) => s.timeZone);

  const activeStatus = kind === 'task' ? TaskStatus.ACTIVE : ProjectStatus.ACTIVE;
  const eligible =
    !!item &&
    item.scheduledDate != null &&
    !!item.repeatRule &&
    item.status === activeStatus &&
    !item.trashedAt;
  const repeatRule = item?.repeatRule;
  const scheduledDate = item?.scheduledDate ?? null;
  const occurrenceDate = item?.occurrenceDate ?? null;
  const target = React.useMemo(
    () =>
      enabled && eligible && repeatRule
        ? nextOccurrenceDate(repeatRule, {
            scheduledDate,
            occurrenceDate,
            settledAt: new Date().toISOString(),
            timeZone,
            legacyDateTimeZone: currentLegacyDateTimeZone(),
          })
        : null,
    [enabled, eligible, repeatRule, scheduledDate, occurrenceDate, timeZone],
  );

  const onSuccess = (copy: { scheduledDate: string | null }) => {
    if (!copy.scheduledDate) return;
    const date = new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    }).format(parseCalendarDate(copy.scheduledDate));
    toast.success(t('nextCopyCreated', { date }));
  };
  const onError = (error: unknown) =>
    toast.error(
      error instanceof RepeatSkipBlockedError && error.reason === 'next-exists'
        ? t('nextCopyExists')
        : tc('saveFailed'),
    );

  const create = () => {
    if (!item) return;
    if (kind === 'task') createTaskCopy.mutate(item.id, { onSuccess, onError });
    else createProjectCopy.mutate(item.id, { onSuccess, onError });
  };

  return { available: eligible && target !== null, target, create };
}
