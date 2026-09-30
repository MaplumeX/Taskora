import i18n from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { reminderActionLabels } from './reminder-texts';

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
