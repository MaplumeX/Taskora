import { afterEach, describe, expect, it } from 'vitest';

import { defaultSound } from './tauri-notification-shell';

/**
 * 默认提示音是「静默失败」的高危区：平台字面量传错不会报错，只是通知
 * 不响（winrt 侧解析失败被 .ok() 吞掉）。这里把三个平台的取值钉住。
 */
describe('defaultSound', () => {
  const originalUserAgent = navigator.userAgent;

  function setUserAgent(userAgent: string) {
    Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  }

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  it('Windows 用 winrt 枚举名 Default（大小写敏感）', () => {
    setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    );
    expect(defaultSound()).toBe('Default');
  });

  it('macOS 用 NSUserNotificationDefaultSoundName 的值 default', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    );
    expect(defaultSound()).toBe('default');
  });

  it('Linux 不传 sound（XDG 后端不读该字段）', () => {
    setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    );
    expect(defaultSound()).toBeUndefined();
  });
});
