/**
 * 自绘托盘菜单（Windows / macOS 右键托盘图标）。
 *
 * 窗口行为见 src-tauri/src/tray_menu.rs：透明无边框窗口，Rust 侧在光标处
 * 定位后显示并派发 `tray-menu://open`；失焦即隐藏。菜单项点击经
 * `tray_menu_action` 交回 Rust 执行（显示主窗口 / Quick Add / 退出）。
 *
 * 主题与语言：本窗口是独立 webview，每次打开从共享的 localStorage 重读偏好，
 * 与主窗口当前设置保持一致。视觉沿用 App 内 DropdownMenu 的样式。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { AppWindow, Plus, Power, type LucideIcon } from 'lucide-react';

import { applyTheme, i18n, usePreferencesStore } from '@taskora/api';
import {
  acceleratorToChord,
  detectKeyPlatform,
  formatChord,
} from '@taskora/ui/components/keyboard/keymap';
import { getQuickAddAccelerator } from '@taskora/ui/components/keyboard/quickAddHotkey';

type TrayAction = 'show' | 'quick-add' | 'quit';

interface TrayItem {
  action: TrayAction;
  labelKey: 'show' | 'newTask' | 'quit';
  icon: LucideIcon;
}

const GROUPS: TrayItem[][] = [
  [
    { action: 'show', labelKey: 'show', icon: AppWindow },
    { action: 'quick-add', labelKey: 'newTask', icon: Plus },
  ],
  [{ action: 'quit', labelKey: 'quit', icon: Power }],
];

/** 系统级 Quick Add 快捷键（用户可改绑，quick_add_shortcut.rs）的展示文案。 */
async function quickAddShortcutText(): Promise<string | null> {
  const accelerator = await getQuickAddAccelerator();
  if (!accelerator) return null;
  const platform = detectKeyPlatform();
  return formatChord(acceleratorToChord(accelerator, platform), platform);
}

/** 从 localStorage 重读偏好（主窗口可能刚改过主题 / 语言）。 */
async function syncPreferences() {
  await usePreferencesStore.persist.rehydrate();
  const { theme, language } = usePreferencesStore.getState();
  applyTheme(theme);
  if (i18n.language !== language) await i18n.changeLanguage(language);
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function playEnter(el: HTMLElement | null) {
  if (!el || typeof el.animate !== 'function' || reducedMotion()) return;
  el.animate(
    [
      { opacity: 0, transform: 'scale(0.96)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  );
}

const items = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tray-item]'));

export function TrayMenuApp() {
  const { t } = useTranslation('tray');
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [quickAddShortcut, setQuickAddShortcut] = useState<string | null>(null);

  // 窗口尺寸贴合菜单内容，Rust 侧据此计算弹出位置。
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const resize = () =>
      void getCurrentWindow()
        .setSize(new LogicalSize(el.offsetWidth, el.offsetHeight))
        .catch(() => undefined);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const syncShortcut = () =>
      void quickAddShortcutText().then(setQuickAddShortcut, () => undefined);
    void syncPreferences().catch(() => undefined);
    syncShortcut();
    const unlisten = listen('tray-menu://open', () => {
      void syncPreferences().catch(() => undefined);
      syncShortcut();
      playEnter(surfaceRef.current);
      surfaceRef.current?.focus();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const run = (action: TrayAction) => {
    void invoke('tray_menu_action', { action }).catch(() => undefined);
  };

  // 键盘：↑↓ 循环移动焦点，Enter / Space 由 button 原生触发，Esc 关闭。
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      void getCurrentWindow().hide();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = items();
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = current === -1 ? (step === 1 ? 0 : list.length - 1) : current + step;
    list[(next + list.length) % list.length]?.focus();
  };

  return (
    // 不画投影：透明窗口会把超出边界的阴影裁成矩形灰底，菜单边缘只靠边框区分。
    <div ref={rootRef} className="inline-block">
      <div
        ref={surfaceRef}
        tabIndex={-1}
        role="menu"
        aria-label="Taskora"
        onKeyDown={onKeyDown}
        className="w-56 select-none rounded-[10px] border border-border bg-popover p-1 text-popover-foreground outline-none"
      >
        {GROUPS.map((group, i) => (
          <div key={i} role="group">
            {i > 0 && <div role="separator" className="-mx-1 my-1 h-px bg-border" />}
            {group.map(({ action, labelKey, icon: Icon }) => {
              const shortcut = action === 'quick-add' ? quickAddShortcut : null;
              return (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  data-tray-item
                  onClick={() => run(action)}
                  onMouseEnter={(e) => e.currentTarget.focus()}
                  onMouseLeave={() => surfaceRef.current?.focus()}
                  className="group flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus:bg-primary focus:text-primary-foreground"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-focus:text-primary-foreground" />
                  <span className="flex-1 truncate">{t(labelKey)}</span>
                  {shortcut && (
                    <span className="text-xs text-muted-foreground group-focus:text-primary-foreground/80">
                      {shortcut}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
