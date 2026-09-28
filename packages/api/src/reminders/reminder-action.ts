/**
 * Reminder Action — 通知操作（完成 / Snooze）的应用规则（reminder-actions spec）。
 *
 * 纯函数：输入通知快照（taskId + 触发时对应的 fireAt）、动作、点击时刻与
 * 任务当前行，输出要执行的任务操作或丢弃。平台壳（桌面事件 / Android
 * 原生动作队列）只负责把点击交过来，规则全在这里。
 *
 * - 过期校验：任务不存在、已了结或已进 Trash，或当前提醒的 fireAt 与通知
 *   快照不一致（别处已改期/改提醒）→ 丢弃，迟到的操作不覆盖别处的新改动。
 * - Snooze（CONTEXT.md）：把提醒挪到目标时刻 T——计划日期 := T 在账号时区
 *   的日历日，reminderTime := T 的 HH:mm；原提醒时刻被覆盖。
 * - 完成以点击时刻为了结时间（Logbook 归组正确，排队延迟应用亦然）。
 */

import { addCalendarDays, instantDateKey, instantWallTime } from '@taskora/shared';

import { isReminderEligible, reminderFireAt, type ReminderTaskInput } from './reminder-scheduler';

export type ReminderActionKind = 'complete' | 'snooze15' | 'snooze60' | 'snoozeTomorrow';

/** 一次通知点击（桌面事件 / Android 动作队列条目）。 */
export interface ReminderActionRequest {
  taskId: string;
  action: ReminderActionKind;
  /** 通知对应的触发时刻（epoch ms），用于过期校验。 */
  firedFireAt: number;
  /** 点击时刻（epoch ms）。 */
  tappedAt: number;
}

export type ReminderActionResolution =
  | { kind: 'complete'; settledAt: string }
  | { kind: 'snooze'; scheduledDate: string; reminderTime: string }
  | { kind: 'discard'; reason: 'missing' | 'ineligible' | 'stale' };

const MINUTE_MS = 60_000;

/** 相对 Snooze 的时长；「明天」不是固定时长（按账号时区日历日推算）。 */
const SNOOZE_DURATION_MS: Partial<Record<ReminderActionKind, number>> = {
  snooze15: 15 * MINUTE_MS,
  snooze60: 60 * MINUTE_MS,
};

export function resolveReminderAction(
  task: ReminderTaskInput | null,
  request: ReminderActionRequest,
  timeZone: string,
  legacyZone = timeZone,
): ReminderActionResolution {
  if (task === null) return { kind: 'discard', reason: 'missing' };
  if (!isReminderEligible(task)) return { kind: 'discard', reason: 'ineligible' };
  const current = reminderFireAt(task.scheduledDate!, task.reminderTime!, timeZone, legacyZone);
  if (current !== request.firedFireAt) return { kind: 'discard', reason: 'stale' };

  if (request.action === 'complete') {
    return { kind: 'complete', settledAt: new Date(request.tappedAt).toISOString() };
  }
  const target = snoozeTarget(request.action, request.tappedAt, task.reminderTime!, timeZone);
  return { kind: 'snooze', ...target };
}

/**
 * Snooze 目标（账号时区墙上时刻）。
 * - 15 分钟 / 1 小时：点击时刻 + 时长，向上取整到分钟（可能跨午夜，计划日期随之变为次日）；
 * - 明天：点击日 + 1 的当前提醒时刻。
 */
export function snoozeTarget(
  action: Exclude<ReminderActionKind, 'complete'>,
  tappedAt: number,
  reminderTime: string,
  timeZone: string,
): { scheduledDate: string; reminderTime: string } {
  const duration = SNOOZE_DURATION_MS[action];
  if (duration !== undefined) {
    const target = Math.ceil((tappedAt + duration) / MINUTE_MS) * MINUTE_MS;
    const { date, time } = instantWallTime(target, timeZone);
    return { scheduledDate: date, reminderTime: time };
  }
  const tomorrow = addCalendarDays(instantDateKey(new Date(tappedAt), timeZone), 1);
  return { scheduledDate: tomorrow, reminderTime };
}
