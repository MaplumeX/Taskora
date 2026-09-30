import { useMemo } from 'react';
import { buildRepeatPreviews, type RepeatPreview } from '@taskora/engine';

import { currentLegacyDateTimeZone, currentTimeZone } from '@/utils/date';
import { useCalendarDay } from './useCalendarDay';
import { useScheduledTasksQuery } from './useScheduledTasksQuery';

/**
 * 下次预告（Repeat Preview，recurring-tasks-v2）：每条重复链的下一次，
 * 供 Upcoming / Calendar 渲染只读行。数据来自全部带计划日期的任务（含
 * 已了结），跨午夜 / 切换时区时重算。
 */
export function useRepeatPreviews(): RepeatPreview[] {
  const calendarDay = useCalendarDay();
  const { data: tasks } = useScheduledTasksQuery();
  return useMemo(
    () =>
      tasks
        ? buildRepeatPreviews(tasks, {
            timeZone: currentTimeZone(),
            legacyDateTimeZone: currentLegacyDateTimeZone(),
            now: new Date(),
          })
        : [],
    // calendarDay 编码了时区与「今天」：变化即重算
    [tasks, calendarDay],
  );
}
