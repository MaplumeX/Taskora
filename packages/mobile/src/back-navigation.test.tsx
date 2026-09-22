import { useState } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Android 返回手势级联（issue 05 验收）：
 *   关闭浮层 → 路由返回 → 根页退出（app_exit）。
 * mock @tauri-apps/api/app 的 onBackButtonPress 捕获回调。
 */

const hoisted = vi.hoisted(() => {
  return {
    backHandler: null as null | ((payload: { canGoBack: boolean }) => void),
    exitInvoke: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@tauri-apps/api/app', () => ({
  onBackButtonPress: vi.fn((handler: (payload: { canGoBack: boolean }) => void) => {
    hoisted.backHandler = handler;
    return Promise.resolve({ remove: vi.fn() });
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: hoisted.exitInvoke,
}));

import {
  hasOpenOverlay,
  canNavigateBack,
  useBackNavigation,
} from './back-navigation';
import { Dialog, DialogContent, DialogTitle } from '@taskora/ui/components/ui/dialog';

function pressBack() {
  expect(hoisted.backHandler).toBeTruthy();
  hoisted.backHandler!({ canGoBack: false });
}

function installShell() {
  function Probe() {
    useBackNavigation();
    return <div>shell</div>;
  }
  render(<Probe />);
}

describe('back-navigation 级联（issue 05）', () => {
  it('非 Tauri 环境不注册监听', async () => {
    const { onBackButtonPress } = await import('@tauri-apps/api/app');
    installShell();
    expect(onBackButtonPress).not.toHaveBeenCalled();
  });
});

describe('back-navigation 级联（Tauri 环境，issue 05）', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: { invoke: vi.fn() },
    });
    window.history.replaceState(null, '', '/');
    hoisted.exitInvoke.mockClear();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    hoisted.backHandler = null;
  });

  it('第一级：打开的 Radix 浮层被关闭，且不路由返回/退出', async () => {
    const onOpenChange = vi.fn();
    function Fixture() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog
          open={open}
          onOpenChange={(value) => {
            onOpenChange(value);
            setOpen(value);
          }}
        >
          <DialogContent>
            <DialogTitle>任务详情</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Fixture />);
    expect(hasOpenOverlay()).toBe(true);

    installShell();
    await waitFor(() => expect(hoisted.backHandler).toBeTruthy());

    pressBack();

    // Radix 收到合成 Escape 关闭了浮层
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(hasOpenOverlay()).toBe(false);
    });
    // 没有退出
    expect(hoisted.exitInvoke).not.toHaveBeenCalled();
  });

  it('第二级：无浮层但历史可返回 → history.back', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    window.history.replaceState({ idx: 2 }, '', '/today');
    expect(canNavigateBack()).toBe(true);

    installShell();
    await waitFor(() => expect(hoisted.backHandler).toBeTruthy());

    pressBack();

    expect(backSpy).toHaveBeenCalled();
    expect(hoisted.exitInvoke).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });

  it('第三级：根页无浮层 → 退出 App（app_exit command）', async () => {
    window.history.replaceState({ idx: 0 }, '', '/today');
    expect(canNavigateBack()).toBe(false);

    installShell();
    await waitFor(() => expect(hoisted.backHandler).toBeTruthy());

    pressBack();

    expect(hoisted.exitInvoke).toHaveBeenCalledWith('app_exit');
  });
});
