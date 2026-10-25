/**
 * 出现日（Occurrence Date，recurring-tasks-v4）：重复链上这一环原定的日期；
 * 为空即等于计划日期。按计划日期推算的规则从出现日推算下一次，改期只挪
 * 这一次（Repeat Exception），不改变节奏。Task 与 Project 同一口径。
 */

import { normalizeRepeatRule } from '../repeat';
import { dateKeyOf, type CalendarZones } from './calendar';

/** 出现日推导需要的现有字段（日期可为存储形态）。 */
export interface OccurrenceBase {
  scheduledDate: unknown;
  repeatRule?: unknown;
  occurrenceDate?: unknown;
}

/** 这一环的出现日（日期键）：`occurrenceDate ?? scheduledDate`。 */
export function occurrenceKeyOf(source: OccurrenceBase, zones: CalendarZones): string | null {
  return dateKeyOf(source.occurrenceDate, zones) ?? dateKeyOf(source.scheduledDate, zones);
}

/**
 * 编辑时的出现日写入（planTaskUpdate / planProjectUpdate 共用）：
 *
 * - 计划日期清除 → 清空（规则随之清除）；
 * - 同次编辑写了规则（含 null）→ 清空：规则从新的计划日期重新起算（更新规则）；
 * - 改计划日期、现有规则 anchor=scheduled → 保留原出现日（例外）；挪回原定
 *   那天时清空；
 * - 其他不动。只在值变化时写。
 *
 * `scheduledDate` 为本次编辑后的计划日期，`ruleWritten` 为本次是否写了规则。
 */
export function planOccurrenceDate(
  existing: OccurrenceBase,
  input: { scheduledDate?: unknown },
  scheduledDate: string | null,
  ruleWritten: boolean,
  zones: CalendarZones,
): { occurrenceDate?: string | null } {
  const current = dateKeyOf(existing.occurrenceDate, zones);
  const clear = current !== null ? { occurrenceDate: null } : {};
  if (scheduledDate === null || ruleWritten) return clear;
  if (input.scheduledDate === undefined) return {};
  const before = dateKeyOf(existing.scheduledDate, zones);
  if (before === null || before === scheduledDate) return {};
  if (normalizeRepeatRule(existing.repeatRule)?.anchor !== 'scheduled') return clear;
  const occurrence = current ?? before;
  const next = occurrence === scheduledDate ? null : occurrence;
  return next === current ? {} : { occurrenceDate: next };
}
