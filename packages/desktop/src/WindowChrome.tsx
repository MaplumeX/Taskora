import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { getCurrentRoute, openWindow } from './windows/open-window';

/** 自绘外壳的平台形态：macOS 保留原生红绿灯，其余平台自绘窗口按钮。 */
export type ChromePlatform = 'mac' | 'other';

/** Tauri 2 的 api 包没有同步的 platform()；webview UA 足够可靠。 */
export function detectChromePlatform(): ChromePlatform {
  return /Macintosh|Mac OS X/i.test(navigator.userAgent) ? 'mac' : 'other';
}

/**
 * 拖拽带高度：macOS 与 Overlay 标题栏（红绿灯）等高，Windows / Linux 与
 * 自绘窗口按钮等高。写入 --titlebar-h，主列 / 助手面板据此让出顶部；
 * 窄窗口（<md，手机布局）经 --native-safe-top 并入 --safe-area-top，
 * 顶栏 / 抽屉 / 全屏弹窗沿用安全区逻辑避让。
 */
const TITLEBAR_HEIGHT: Record<ChromePlatform, number> = { mac: 28, other: 32 };

/**
 * 侧边栏顶部只为红绿灯让位（--sidebar-inset-top）：macOS 让出 16px，叠上
 * 账号行自身的 pt-3 正好排在红绿灯下方；Windows / Linux 的窗口按钮在右侧，
 * 侧边栏左上角不必留白，账号按钮叠在拖拽带之上（Sidebar 里抬高层级）。
 */
const SIDEBAR_INSET_TOP: Record<ChromePlatform, number> = { mac: 16, other: 0 };

function setChromeInsets(platform: ChromePlatform, fullscreen = false) {
  const style = document.documentElement.style;
  style.setProperty('--titlebar-h', `${fullscreen ? 0 : TITLEBAR_HEIGHT[platform]}px`);
  style.setProperty('--sidebar-inset-top', `${fullscreen ? 0 : SIDEBAR_INSET_TOP[platform]}px`);
}

export function installWindowChrome(platform: ChromePlatform = detectChromePlatform()) {
  const root = document.documentElement;
  root.dataset.chrome = platform;
  setChromeInsets(platform);
  root.style.setProperty('--native-safe-top', 'var(--titlebar-h)');
}

/**
 * 主窗口自绘外壳（融合式，Things / Linear 风格）：没有独立的标题栏条，
 * 侧边栏 / 内容区 / 助手面板的底色直接铺到窗口顶，只在顶部叠一条透明
 * 拖拽带；Windows / Linux 在右上角画最小化 / 最大化 / 关闭。
 *
 * - 拖拽与双击最大化由 Tauri 的 data-tauri-drag-region 原生处理
 *   （start_dragging 走系统移动循环，Aero Snap 拖到边缘照常生效）；
 * - 拖拽带在 z-40：弹窗 / 菜单（z-50）盖在它上面，侧边栏账号按钮（z-[41]）
 *   也叠在它上面，按钮之外的空白照常可拖；
 * - 窗口按钮单独叠在弹窗遮罩之上（z-[60] + pointer-events-auto，Radix 模态
 *   会给 body 设 pointer-events:none），打开设置等弹窗时依旧能最小化 / 关闭；
 *   pointerdown 不冒泡到 document、按钮不抢焦点，避免被 Radix 当成
 *   「点击外部」而关掉弹窗；
 * - 全屏（macOS 绿灯）时没有可拖的标题栏，拖拽带收起、各栏顶部不再留白；
 *   新窗口按钮随之收起（快捷键与菜单仍可用）。
 */
export function WindowChrome({ platform = detectChromePlatform() }: { platform?: ChromePlatform }) {
  const { maximized, fullscreen } = useWindowState();

  useEffect(() => {
    setChromeInsets(platform, fullscreen);
  }, [fullscreen, platform]);

  if (fullscreen) return null;

  return (
    <>
      <div
        data-tauri-drag-region
        data-testid="window-chrome"
        className="fixed inset-x-0 top-0 z-40 h-[var(--titlebar-h)] select-none"
      />
      <NewWindowButton platform={platform} />
      {platform === 'other' && <WindowControls maximized={maximized} />}
    </>
  );
}

/** 三个自绘窗口按钮的总宽（46px × 3），新窗口按钮紧贴其左。 */
const WINDOW_CONTROLS_WIDTH = 46 * 3;

/**
 * 新窗口按钮（Things 3 Mac 右上角那个叠放的窗框，.scratch/multi-window）：
 * 点击新窗口打开 Today，按住 ⌥ / Alt 点击新窗口打开当前列表。macOS 在窗口
 * 最右；Windows / Linux 紧贴自绘窗口按钮左侧。层级与侧边栏账号按钮相同
 * （z-[41]）：叠在拖拽带之上、被弹窗遮罩盖住。
 */
function NewWindowButton({ platform }: { platform: ChromePlatform }) {
  const { t } = useTranslation();
  const focused = useDocumentFocused();

  return (
    <button
      type="button"
      data-testid="new-window-button"
      aria-label={t('common:newWindow')}
      title={t('common:newWindowHint')}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => openWindow(e.altKey ? getCurrentRoute() : '/today')}
      style={platform === 'other' ? { right: WINDOW_CONTROLS_WIDTH } : undefined}
      className={
        'fixed top-0 z-[41] flex select-none items-center justify-center transition-colors duration-fast hover:text-foreground ' +
        (platform === 'mac'
          ? 'right-2 mt-[3px] h-[calc(var(--titlebar-h)-6px)] w-7 rounded-md hover:bg-foreground/10 '
          : 'h-[var(--titlebar-h)] w-[40px] hover:bg-foreground/10 active:bg-foreground/15 ') +
        (focused ? 'text-foreground/55' : 'text-foreground/30')
      }
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
      >
        <path d="M3.5 3.5V.5h8v7h-3M.5 3.5h8v8h-8z" />
      </svg>
    </button>
  );
}

function WindowControls({ maximized }: { maximized: boolean }) {
  const { t } = useTranslation();
  const focused = useDocumentFocused();
  const win = () => getCurrentWindow();

  return (
    // 窗口失焦时按钮变淡，与系统标题栏一致；悬停仍恢复正常色。
    <div
      data-testid="window-controls"
      data-focused={focused}
      onPointerDown={(e) => e.stopPropagation()}
      className={
        'pointer-events-auto fixed right-0 top-0 z-[60] flex h-[var(--titlebar-h)] select-none ' +
        (focused ? 'text-foreground/70' : 'text-foreground/35')
      }
    >
      <ControlButton label={t('common:windowMinimize')} onClick={() => void win().minimize()}>
        <path d="M0 5.5h10" />
      </ControlButton>
      <ControlButton
        label={maximized ? t('common:windowRestore') : t('common:windowMaximize')}
        onClick={() => void win().toggleMaximize()}
      >
        {maximized ? <path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /> : <path d="M.5.5h9v9h-9z" />}
      </ControlButton>
      {/* 关闭 = 隐藏到托盘（lib.rs CloseRequested），与原生关闭按钮一致。 */}
      <ControlButton label={t('common:close')} danger onClick={() => void win().close()}>
        <path d="M0 0l10 10M10 0L0 10" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={-1}
      // 不抢焦点：焦点离开打开中的弹窗会触发 Radix 的 onFocusOutside。
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        'flex h-full w-[46px] items-center justify-center transition-colors duration-fast ' +
        (danger
          ? 'hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/90'
          : 'hover:bg-foreground/10 hover:text-foreground active:bg-foreground/15')
      }
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

/**
 * 最大化 / 全屏状态：最大化决定中间按钮画「最大化」还是「向下还原」，
 * 全屏决定是否收起拖拽带。两者变化都会触发 resize，统一在那里重读。
 */
function useWindowState() {
  const [state, setState] = useState({ maximized: false, fullscreen: false });

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const sync = () =>
      Promise.all([win.isMaximized(), win.isFullscreen()]).then(
        ([maximized, fullscreen]) => {
          if (!cancelled) setState({ maximized, fullscreen });
        },
        // Window queries can fail mid-teardown; state is cosmetic.
        () => undefined,
      );

    win
      .onResized(() => void sync())
      .then(
        (fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        },
        () => undefined,
      );
    void sync();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return state;
}

/** 窗口焦点：webview 的 focus / blur 跟随原生窗口激活状态。 */
function useDocumentFocused() {
  const [focused, setFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return focused;
}
