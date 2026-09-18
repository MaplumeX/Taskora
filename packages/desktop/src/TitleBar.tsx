import { useEffect, useMemo, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * 判断是否运行在 macOS：Tauri webview 的 UA 可靠包含 "Macintosh"；
 * 非 Tauri 环境（jsdom 测试 / 浏览器 dev）回退到 UA，保持同逻辑。
 */
function isMacPlatform(): boolean {
  return /Macintosh|Mac OS X/i.test(navigator.userAgent);
}

/**
 * 自绘窗口标题栏（主窗口专用；quick-add 是无边框弹窗，无需标题栏）。
 *
 * - 整条为拖拽区（data-tauri-drag-region），双击切换最大化；
 * - Windows/Linux：右侧 min / max / close 自绘按钮；
 * - macOS：原生红绿灯（lib.rs 里 titleBarStyle Overlay），只保留
 *   拖拽条，左侧留出红绿灯宽度避让，不渲染按钮与标题文字；
 * - 高度由 CSS 变量 --titlebar-h 控制，布局侧通过覆盖 .h-dvh/.h-screen
 *   从视口扣除（见 index.css，仅 [data-window='main'] 生效）。
 */
export function TitleBar() {
  const isMac = useMemo(isMacPlatform, []);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const sync = async () => {
      try {
        setMaximized(await win.isMaximized());
      } catch {
        // Window queries can fail mid-teardown; state is cosmetic.
      }
    };

    win.onResized(() => void sync()).then(
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

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={() => void getCurrentWindow().toggleMaximize()}
      className="fixed inset-x-0 top-0 z-50 flex h-[var(--titlebar-h,38px)] items-stretch border-b bg-secondary/60 backdrop-blur-sm select-none"
    >
      {/* 标题：子元素需 pointer-events-none，否则 mousedown 命中子元素时拖拽失效。
          macOS 下原生红绿灯占位约 78px，用 padding 避让且不再渲染文字。 */}
      <div className={`flex flex-1 items-center ${isMac ? 'pl-[78px]' : 'px-4'}`}>
        {!isMac && (
          <span className="pointer-events-none font-display text-sm font-semibold tracking-wide text-muted-foreground">
            Taskora
          </span>
        )}
      </div>

      {!isMac && (
        <>
          <WindowControl label="Minimize" onClick={() => void getCurrentWindow().minimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </WindowControl>
          <WindowControl
            label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => void getCurrentWindow().toggleMaximize()}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M2.5 2.5V0.5h7v7h-2M0.5 3v6.5H7V3H0.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0.5 0.5h9v9h-9z" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </WindowControl>
          <WindowControl
            label="Close"
            danger
            onClick={() => void getCurrentWindow().close()}
            className="hover:bg-destructive hover:text-white"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </WindowControl>
        </>
      )}
    </header>
  );
}

function WindowControl({
  label,
  onClick,
  danger,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[
        'flex w-[46px] items-center justify-center text-foreground/70 transition-colors',
        danger ? '' : 'hover:bg-foreground/10 hover:text-foreground',
        'active:bg-foreground/20',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}
