import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

import { createDesktopNotificationShell, defaultSound } from './tauri-notification-shell';

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

/**
 * 权限检测必须直调原生命令、不经过 guest-js 的 window.Notification 缓存
 * （Windows 上该缓存启动即被初始化成 'denied'，造成「已禁用」误报）。
 */
describe('createDesktopNotificationShell 权限检测', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  it('isPermissionGranted 直查原生命令，true → granted', async () => {
    mocks.invoke.mockResolvedValue(true);
    const shell = createDesktopNotificationShell();
    await expect(shell.isPermissionGranted()).resolves.toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:notification|is_permission_granted');
  });

  it('isPermissionGranted：原生命令返回 null（Prompt）视为未授权', async () => {
    mocks.invoke.mockResolvedValue(null);
    const shell = createDesktopNotificationShell();
    await expect(shell.isPermissionGranted()).resolves.toBe(false);
  });

  it('isPermissionGranted：命令失败返回 false 而不抛出', async () => {
    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    const shell = createDesktopNotificationShell();
    await expect(shell.isPermissionGranted()).resolves.toBe(false);
  });

  it('requestPermission 直读原生命令返回值，granted → true', async () => {
    mocks.invoke.mockResolvedValue('granted');
    const shell = createDesktopNotificationShell();
    await expect(shell.requestPermission()).resolves.toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:notification|request_permission');
  });

  it('requestPermission：非 granted 或失败均返回 false', async () => {
    const shell = createDesktopNotificationShell();
    mocks.invoke.mockResolvedValue('denied');
    await expect(shell.requestPermission()).resolves.toBe(false);
    mocks.invoke.mockRejectedValue(new Error('ipc unavailable'));
    await expect(shell.requestPermission()).resolves.toBe(false);
  });
});

describe('createDesktopNotificationShell fireNow', () => {
  const originalUserAgent = navigator.userAgent;

  function setUserAgent(userAgent: string) {
    Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  }

  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  it('直调 notify 命令并带上平台默认提示音（Windows）', async () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    mocks.invoke.mockResolvedValue(undefined);
    const shell = createDesktopNotificationShell();
    await shell.fireNow('标题', '正文');
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:notification|notify', {
      options: { title: '标题', body: '正文', sound: 'Default' },
    });
  });

  it('Linux 不传 sound 字段', async () => {
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    mocks.invoke.mockResolvedValue(undefined);
    const shell = createDesktopNotificationShell();
    await shell.fireNow('标题', '正文');
    expect(mocks.invoke).toHaveBeenCalledWith('plugin:notification|notify', {
      options: { title: '标题', body: '正文' },
    });
  });

  it('notify 失败被 catch 并告警，不向外抛出', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.invoke.mockRejectedValue(new Error('notify failed'));
    const shell = createDesktopNotificationShell();
    await expect(shell.fireNow('标题', '正文')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
