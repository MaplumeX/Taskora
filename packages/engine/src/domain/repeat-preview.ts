/**
 * 下次预告（Repeat Preview，recurring-tasks-v2 issue 03）：Upcoming /
 * Calendar 中对每条重复链「下一次」的只读投影。纯渲染层推导——不是
 * Task、不落库、不同步；web 的 Engine 路径与 REST 回退路径同一口径。
 */

import { ScheduledType, TaskStatus } from '@taskora/shared';

import { deriveRepeatInstanceId, nextOccurrenceDate, normalizeRepeatRule } from '../repeat';
import { dateKeyOf, todayKey, type CalendarContext } from './calendar';

/** 预告推导需要的任务字段（Task 行与 TaskResponseDto 皆可）。 */
export interface RepeatPreviewSource {
  id: string;
  title: string;
  status: unknown;
  trashedAt: unknown;
  scheduledType: unknown;
  scheduledDate: unknown;
  repeatRule: unknown;
  repeatSourceId?: string | null;
  projectId: string | null;
  areaId: string | null;
}

export interface RepeatPreview {
  /** 被投影的来源任务（当前实例）。 */
  sourceTaskId: string;
  title: string;
  /** 下一次出现日（日期键）。 */
  dateKey: string;
  projectId: string | null;
  areaId: string | null;
}

/**
 * 每条链只投影下一次。tasks 应包含全部未进 Trash、带计划日期的任务
 * （含已了结）——既是来源，也用于判定「下一次已派生」。
 *
 * 不投影：未了结以外 / Trash / 非 DATE / 无规则；anchor=completion（下一次
 * 取决于实际完成日，无法预告）；下一次不晚于今天（逾期来源的下一次可能
 * 仍在过去，过去格子里的预告会被误读）；链已终结（until）；下一次已派生
 * ——按 repeatSourceId，或（repeatSourceId 之前的存量实例）按确定性 id。
 */
export function buildRepeatPreviews(
  tasks: readonly RepeatPreviewSource[],
  context: CalendarContext,
): RepeatPreview[] {
  const live = tasks.filter((task) => task.trashedAt == null);
  const linkedSources = new Set(
    live.flatMap((task) => (task.repeatSourceId ? [task.repeatSourceId] : [])),
  );
  const ids = new Set(live.map((task) => task.id));
  const today = todayKey(context);

  const previews: RepeatPreview[] = [];
  for (const task of live) {
    if (task.status !== TaskStatus.ACTIVE || task.scheduledType !== ScheduledType.DATE) continue;
    const rule = normalizeRepeatRule(task.repeatRule);
    if (!rule || rule.anchor !== 'scheduled' || linkedSources.has(task.id)) continue;
    const next = nextOccurrenceDate(rule, {
      scheduledDate: dateKeyOf(task.scheduledDate, context),
      timeZone: context.timeZone,
      legacyDateTimeZone: context.legacyDateTimeZone,
    });
    if (next === null || next <= today) continue;
    if (ids.has(deriveRepeatInstanceId(task.id, rule, next))) continue;
    previews.push({
      sourceTaskId: task.id,
      title: task.title,
      dateKey: next,
      projectId: task.projectId,
      areaId: task.areaId,
    });
  }
  return previews.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
}
