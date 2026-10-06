/**
 * 系统级 Quick Add 快捷键的桌面壳桥接（quick_add_shortcut.rs）。键位以
 * Tauri accelerator 存在 Rust 侧：启动时须在任何 webview 加载前注册。
 * invoke 按需动态 import，不进入 web 端运行路径。
 */

const invokeShell = async <T>(cmd: string, args?: Record<string, unknown>) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

/** 当前生效的 accelerator；空字符串表示注册失败、没有可用的系统级快捷键。 */
export const getQuickAddAccelerator = () => invokeShell<string>('quick_add_shortcut_get');

/** 改绑（null 恢复默认），返回生效的 accelerator；被其他应用占用时 reject。 */
export const setQuickAddAccelerator = (accelerator: string | null) =>
  invokeShell<string>('quick_add_shortcut_set', { shortcut: accelerator });
