import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const win = vi.hoisted(() => {
  const state = { maximized: false, fullscreen: false, onResized: () => {} };
  return {
    state,
    minimize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    isMaximized: vi.fn(() => Promise.resolve(state.maximized)),
    isFullscreen: vi.fn(() => Promise.resolve(state.fullscreen)),
    onResized: vi.fn((handler: () => void) => {
      state.onResized = handler;
      return Promise.resolve(() => {});
    }),
  };
});

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => win }));

const { WindowChrome, installWindowChrome } = await import('./WindowChrome');

const titlebarHeight = () => document.documentElement.style.getPropertyValue('--titlebar-h');
const sidebarInset = () => document.documentElement.style.getPropertyValue('--sidebar-inset-top');

/** 模拟一次原生 resize（最大化 / 全屏切换都会触发）。 */
async function resizeTo(next: { maximized?: boolean; fullscreen?: boolean }) {
  Object.assign(win.state, next);
  await act(async () => win.state.onResized());
}

beforeEach(() => {
  vi.clearAllMocks();
  win.state.maximized = false;
  win.state.fullscreen = false;
});

afterEach(() => {
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.chrome;
});

describe('WindowChrome', () => {
  it('draws minimize / maximize / close on Windows and Linux', () => {
    render(<WindowChrome platform="other" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

    for (const button of buttons) fireEvent.click(button);
    expect(win.minimize).toHaveBeenCalledOnce();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
    expect(win.close).toHaveBeenCalledOnce();
  });

  it('leaves the window buttons to the native traffic lights on macOS', () => {
    render(<WindowChrome platform="mac" />);
    expect(screen.getByTestId('window-chrome')).toHaveAttribute('data-tauri-drag-region');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('keeps window-button pointerdown from reaching document (Radix outside-click dismiss)', () => {
    const outside = vi.fn();
    document.addEventListener('pointerdown', outside);
    render(<WindowChrome platform="other" />);
    fireEvent.pointerDown(screen.getByRole('button', { name: /Minimize|最小化/ }));
    document.removeEventListener('pointerdown', outside);
    expect(outside).not.toHaveBeenCalled();
  });

  it('switches the middle button to restore while maximized', async () => {
    render(<WindowChrome platform="other" />);
    expect(screen.getByRole('button', { name: /Maximize|最大化/ })).toBeInTheDocument();

    await resizeTo({ maximized: true });
    expect(screen.getByRole('button', { name: /Restore|还原/ })).toBeInTheDocument();
  });

  it('collapses the drag strip in fullscreen and restores it after', async () => {
    installWindowChrome('mac');
    render(<WindowChrome platform="mac" />);
    await waitFor(() => expect(win.onResized).toHaveBeenCalled());

    await resizeTo({ fullscreen: true });
    expect(screen.queryByTestId('window-chrome')).not.toBeInTheDocument();
    expect(titlebarHeight()).toBe('0px');
    expect(sidebarInset()).toBe('0px');

    await resizeTo({ fullscreen: false });
    expect(screen.getByTestId('window-chrome')).toBeInTheDocument();
    expect(titlebarHeight()).toBe('28px');
    expect(sidebarInset()).toBe('16px');
  });

  it('dims the window buttons while the window is inactive', () => {
    render(<WindowChrome platform="other" />);
    const controls = screen.getByTestId('window-controls');

    act(() => void window.dispatchEvent(new Event('blur')));
    expect(controls).toHaveAttribute('data-focused', 'false');
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(controls).toHaveAttribute('data-focused', 'true');
  });
});

describe('installWindowChrome', () => {
  it('exposes the drag strip height to the shared layout', () => {
    installWindowChrome('other');
    expect(titlebarHeight()).toBe('32px');
    // 窗口按钮在右侧，侧边栏左上角不留白。
    expect(sidebarInset()).toBe('0px');
    expect(document.documentElement.style.getPropertyValue('--native-safe-top')).toBe(
      'var(--titlebar-h)',
    );
    expect(document.documentElement.dataset.chrome).toBe('other');
  });

  it('matches the macOS overlay title bar height', () => {
    installWindowChrome('mac');
    expect(titlebarHeight()).toBe('28px');
    expect(sidebarInset()).toBe('16px');
  });
});
