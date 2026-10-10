/**
 * 系统剪贴板文字的读写（⌘C / ⌘V 复制粘贴任务）。桌面壳走原生剪贴板
 * （tauri-plugin-clipboard-manager）：WKWebView 的 navigator.clipboard 读取
 * 其他应用写入的内容时会弹出系统的「粘贴」确认。Web 与移动端用
 * navigator.clipboard（Chromium 首次读取会询问权限）。invoke 按需动态
 * import，不进入 web 端运行路径。
 */

import { getClientKind } from '@taskora/api';

/** 桌面 Tauri 壳（移动端同样注入 __TAURI_INTERNALS__，须同时校验 clientKind）。 */
const isDesktopShell = () => '__TAURI_INTERNALS__' in globalThis && getClientKind() === 'desktop';

const invokeClipboard = async <T>(cmd: string, args?: Record<string, unknown>) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(`plugin:clipboard-manager|${cmd}`, args);
};

/**
 * 读剪贴板文字。读不到时：桌面返回 ''（剪贴板为空或不是文字，确定不是
 * ⌘C 写入的内容）；其他端返回 null（不支持或被拒绝，内容未知）。
 */
export async function readClipboardText(): Promise<string | null> {
  if (isDesktopShell()) {
    try {
      return await invokeClipboard<string>('read_text');
    } catch {
      return '';
    }
  }
  try {
    return (await navigator.clipboard?.readText()) ?? null;
  } catch {
    return null;
  }
}

/** 写剪贴板文字；失败静默（⌘V 仍可从本机记下的条目粘贴）。 */
export async function writeClipboardText(text: string): Promise<void> {
  try {
    if (isDesktopShell()) await invokeClipboard('write_text', { text });
    else await navigator.clipboard?.writeText(text);
  } catch {
    // 忽略
  }
}
