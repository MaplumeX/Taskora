import { setSystemTheme } from '@taskora/api';
import { addPluginListener, invoke } from '@tauri-apps/api/core';

interface SystemTheme {
  dark: boolean;
}

/** Android 的 uiMode 是主题来源；浏览器预览继续使用 matchMedia。 */
export async function installSystemTheme(): Promise<() => void> {
  let revision = 0;
  const apply = ({ dark }: SystemTheme) => {
    revision += 1;
    setSystemTheme(dark ? 'dark' : 'light');
  };

  try {
    // 先订阅再读取，避免初始化期间漏掉系统切换。
    const handle = await addPluginListener<SystemTheme>('background', 'theme', apply);
    const beforeRead = revision;
    try {
      const theme = await invoke<SystemTheme>('plugin:background|system_theme');
      // 读取期间收到的事件比快照更新，不能被旧快照覆盖。
      if (revision === beforeRead) apply(theme);
    } catch {
      // 查询失败仍保留监听，下一次配置变化 / 回前台可恢复。
    }
    return () => {
      void handle.unregister().catch(() => undefined);
      setSystemTheme(null);
    };
  } catch {
    return () => undefined;
  }
}
