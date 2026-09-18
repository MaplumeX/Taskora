/**
 * 键位解析器（ADR-0004）：事件 + 平台 → 动作。
 *
 * 平台键位约定：
 * - mac（Tauri macOS）：Things 原键位（⌘）
 * - windows（Tauri Windows）：⌘ → Ctrl 自适应
 * - web：浏览器保留键不可拦截，系统性降级为 Alt 系
 *
 * 键位完整对照表见 docs/keyboard-shortcuts.md。
 */

export type KeyPlatform = 'mac' | 'windows' | 'web';

export type KeyAction =
  /** ⌘/Ctrl/Alt + 1..6 → 跳转 Bucket（1=Inbox … 6=Logbook）。 */
  | { type: 'navigate'; index: 1 | 2 | 3 | 4 | 5 | 6 }
  /** 返回上一列表。Web 端不派发（浏览器自带 Alt+← 后退）。 */
  | { type: 'back' }
  | { type: 'moveUp' }
  | { type: 'moveDown' }
  | { type: 'moveFirst' }
  | { type: 'moveLast' }
  | { type: 'selectAll' }
  /** ⌘K/Ctrl+K：完成选中；Logbook 中撤销完成。 */
  | { type: 'complete' }
  /** ⌫/Delete：移入 Trash；Trash 页遵循该页约定（恢复）。 */
  | { type: 'delete' }
  /** Enter：行内展开选中任务。 */
  | { type: 'expand' }
  /** Space：选中项下方新建任务（无选中时等同 newTask）。 */
  | { type: 'newTaskBelow' }
  | { type: 'newTask' }
  | { type: 'newProject' }
  | { type: 'newHeading' }
  /** ⌘F/Ctrl+F：打开搜索。 */
  | { type: 'search' };

/** 解析器所需的最小事件形状（便于测试构造）。 */
export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** 运行时平台检测：Tauri 注入对象 + UA 判定；非 Tauri 一律视为 web。 */
export function detectKeyPlatform(): KeyPlatform {
  if (typeof window === 'undefined') return 'web';
  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (!isTauri) return 'web';
  const ua = navigator.userAgent;
  return /Mac|iPhone|iPad/.test(ua) ? 'mac' : 'windows';
}

/** ⌘1..⌘6 跳转的 Bucket 路由（顺序见 docs/keyboard-shortcuts.md）。 */
export const BUCKET_ROUTES = [
  '/inbox',
  '/today',
  '/upcoming',
  '/anytime',
  '/someday',
  '/logbook',
] as const;

function primary(e: KeyEventLike, platform: KeyPlatform): boolean {
  if (platform === 'mac') return e.metaKey;
  // Web：字母组合键（⌘K/⌘A/⌘F）接受 Ctrl 或 ⌘（mac 浏览器用户用 ⌘）；
  // 数字导航例外（见 navigate 分支，⌘数字是浏览器标签切换，仅 Alt 系）。
  return e.ctrlKey || e.metaKey;
}

export function resolveAction(e: KeyEventLike, platform: KeyPlatform): KeyAction | null {
  const cmd = primary(e, platform);
  const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
  const altOnly = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey;
  const key = e.key;

  // --- 导航 ---
  if (key >= '1' && key <= '6') {
    const byPlatform =
      (platform === 'web' && altOnly) || (platform !== 'web' && cmd && !e.altKey && !e.shiftKey);
    if (byPlatform) return { type: 'navigate', index: Number(key) as 1 | 2 | 3 | 4 | 5 | 6 };
    return null;
  }

  // 返回：mac ⌘←；Windows 桌面 Alt+←；Web 不派发（浏览器后退同效）。
  if (key === 'ArrowLeft') {
    if (platform === 'mac' && cmd && !e.altKey) return { type: 'back' };
    if (platform === 'windows' && altOnly) return { type: 'back' };
    return null;
  }

  // --- 选择 ---
  if (bare) {
    if (key === 'ArrowUp') return { type: 'moveUp' };
    if (key === 'ArrowDown') return { type: 'moveDown' };
  }
  if (altOnly) {
    if (key === 'ArrowUp') return { type: 'moveFirst' };
    if (key === 'ArrowDown') return { type: 'moveLast' };
  }

  // --- 主修饰键组合（⌘K 完成 / ⌘A 全选 / ⌘F 搜索） ---
  if (cmd && !e.altKey && !e.shiftKey) {
    if (key === 'k' || key === 'K') return { type: 'complete' };
    if (key === 'a' || key === 'A') return { type: 'selectAll' };
    if (key === 'f' || key === 'F') return { type: 'search' };
  }

  // --- 删除（⌫/Delete，全平台无修饰） ---
  if (bare && (key === 'Backspace' || key === 'Delete')) return { type: 'delete' };

  // --- 展开 / 下方新建（全平台无修饰） ---
  if (bare && key === 'Enter') return { type: 'expand' };
  if (bare && key === ' ') return { type: 'newTaskBelow' };

  // --- 创建 ---
  if (key === 'n' || key === 'N') {
    // mac: ⌘N 新任务；⇧⌘N Heading；⌥⌘N 项目
    // windows: Ctrl+N / Ctrl+Shift+N / Ctrl+Alt+N
    // web: Alt+N 新任务 / Alt+Shift+N 项目（Heading 走 Alt+H）
    if (platform === 'mac') {
      if (e.metaKey && e.shiftKey && !e.altKey) return { type: 'newHeading' };
      if (e.metaKey && !e.shiftKey && e.altKey) return { type: 'newProject' };
      if (e.metaKey && !e.shiftKey && !e.altKey) return { type: 'newTask' };
      return null;
    }
    if (platform === 'windows') {
      if (e.ctrlKey && e.shiftKey && !e.altKey) return { type: 'newHeading' };
      if (e.ctrlKey && !e.shiftKey && e.altKey) return { type: 'newProject' };
      if (e.ctrlKey && !e.shiftKey && !e.altKey) return { type: 'newTask' };
      return null;
    }
    if (altOnly) return { type: 'newTask' };
    if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey) return { type: 'newProject' };
    return null;
  }
  // Web: Alt+H 新 Heading（Alt+Shift+N 已被新项目占用）
  if (platform === 'web' && altOnly && (key === 'h' || key === 'H')) {
    return { type: 'newHeading' };
  }

  return null;
}

/** 按钮上可展示 hint 快捷键的动作（与 docs/keyboard-shortcuts.md 的 P0 键位表一致）。 */
export type HintableAction = 'search' | 'newTask' | 'newProject' | 'newHeading';

/**
 * 动作 → 平台对应键位的展示文案（⌘⇧⌥ 符号 / Ctrl、Alt 文字）。
 * 与 resolveAction 的键位矩阵同源维护；无对应键位时返回 null（hint 只显示文案）。
 */
const SHORTCUT_LABELS: Record<HintableAction, Record<KeyPlatform, string>> = {
  search: { mac: '⌘F', windows: 'Ctrl+F', web: 'Ctrl+F' },
  newTask: { mac: '⌘N', windows: 'Ctrl+N', web: 'Alt+N' },
  newProject: { mac: '⌥⌘N', windows: 'Ctrl+Alt+N', web: 'Alt+Shift+N' },
  newHeading: { mac: '⇧⌘N', windows: 'Ctrl+Shift+N', web: 'Alt+H' },
};

export function shortcutLabel(action: HintableAction, platform: KeyPlatform): string {
  return SHORTCUT_LABELS[action][platform];
}
