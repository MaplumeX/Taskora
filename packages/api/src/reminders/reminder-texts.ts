/**
 * Reminder 通知按钮文案（reminder-actions spec）：按当前 App 语言提供，
 * 原生侧不维护翻译。标题与正文与语言无关，规则在共享 domain
 * （`buildReminderTexts`，@taskora/engine）。
 */

import i18n from 'i18next';

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
