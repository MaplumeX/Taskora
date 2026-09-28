import i18n from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { buildReminderTexts, reminderActionLabels } from './reminder-texts';
import type { ReminderNotification } from './reminder-scheduler';

const notification: ReminderNotification = {
  key: 'reminder:t1',
  taskId: 't1',
  taskTitle: '写周报',
  fireAt: Date.parse('2026-02-05T01:30:00.000Z'), // 上海 09:30
  snoozeTomorrowAt: Date.parse('2026-02-06T01:30:00.000Z'),
};

describe('buildReminderTexts', () => {
  it('无归属、无备注：正文只有时刻', () => {
    expect(
      buildReminderTexts(notification, { parentName: null, notes: null }, 'Asia/Shanghai'),
    ).toEqual({ title: '写周报', body: '09:30' });
  });

  it('有归属：时刻 · 归属名；备注首个非空行另起一行', () => {
    expect(
      buildReminderTexts(
        notification,
        { parentName: '工作', notes: '\n  汇总本周进展  \n第二行' },
        'Asia/Shanghai',
      ),
    ).toEqual({ title: '写周报', body: '09:30 · 工作\n汇总本周进展' });
  });

  it('空白归属名与空白备注视为无', () => {
    expect(
      buildReminderTexts(notification, { parentName: '  ', notes: ' \n ' }, 'Asia/Shanghai'),
    ).toEqual({ title: '写周报', body: '09:30' });
  });

  it('备注首行过长时截断加省略号', () => {
    const { body } = buildReminderTexts(
      notification,
      { parentName: null, notes: '字'.repeat(100) },
      'Asia/Shanghai',
    );
    expect(body).toBe(`09:30\n${'字'.repeat(80)}…`);
  });
});

describe('reminderActionLabels', () => {
  const previous = i18n.language;
  afterEach(() => i18n.changeLanguage(previous));

  it('按当前 App 语言提供按钮文案', async () => {
    await i18n.changeLanguage('zh');
    expect(reminderActionLabels()).toMatchObject({
      complete: '完成',
      snooze15: '15 分钟后',
      snoozeTomorrow: '明天',
    });
    await i18n.changeLanguage('en');
    expect(reminderActionLabels().complete).toBe('Complete');
  });
});
