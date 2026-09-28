/**
 * Reminder 通知文案（reminder-actions spec）。
 *
 * - title：任务标题；
 * - body：`HH:mm · <Project 名或 Area 名>`，备注非空时另起一行附备注首行；
 * - 按钮文案按当前 App 语言提供，原生侧不维护翻译。
 */

import i18n from 'i18next';

import type { ReminderNotification } from './reminder-scheduler';

/** 文案上下文：由协调器按任务当前行查出。 */
export interface ReminderTextContext {
  /** 所属 Project 名（无 Project 时为 Area 名）。 */
  parentName: string | null;
  notes: string | null;
}

export interface ReminderTexts {
  title: string;
  body: string;
}

/** 备注首行的最大长度（超出截断加省略号）。 */
const NOTE_LINE_MAX = 80;

export function buildReminderTexts(
  notification: ReminderNotification,
  context: ReminderTextContext,
  timeZone: string,
): ReminderTexts {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(notification.fireAt));
  const parent = context.parentName?.trim();
  let body = parent ? `${time} · ${parent}` : time;
  const noteLine = firstNoteLine(context.notes);
  if (noteLine) body += `\n${noteLine}`;
  return { title: notification.taskTitle, body };
}

function firstNoteLine(notes: string | null): string | null {
  if (!notes) return null;
  const line = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const chars = Array.from(line);
  return chars.length > NOTE_LINE_MAX ? `${chars.slice(0, NOTE_LINE_MAX).join('')}…` : line;
}

/** 通知按钮文案（按当前语言）。 */
export interface ReminderActionLabels {
  complete: string;
  snooze: string;
  snooze15: string;
  snooze60: string;
  snoozeTomorrow: string;
  snoozeMore: string;
}

export function reminderActionLabels(): ReminderActionLabels {
  return {
    complete: i18n.t('task:reminderActionComplete'),
    snooze: i18n.t('task:reminderActionSnooze'),
    snooze15: i18n.t('task:reminderActionSnooze15'),
    snooze60: i18n.t('task:reminderActionSnooze60'),
    snoozeTomorrow: i18n.t('task:reminderActionSnoozeTomorrow'),
    snoozeMore: i18n.t('task:reminderActionSnoozeMore'),
  };
}
