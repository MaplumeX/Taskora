import { describe, expect, it } from 'vitest';

import { notificationIdForKey } from './notification-shell';

describe('notificationIdForKey', () => {
  it('生成符合原生通知插件的有符号 32 位 id，并保持确定性', () => {
    const key = 'reminder:00000000-0000-4000-8000-000000000040';

    expect(notificationIdForKey(key)).toBe(-1692378605);
    expect(notificationIdForKey(key)).toBe(-1692378605);
  });

  it('哈希为无符号 32 位下界时映射为最小的原生通知 id', () => {
    expect(notificationIdForKey('reminder:edge:)Bi  %Y')).toBe(-2147483648);
  });
});
