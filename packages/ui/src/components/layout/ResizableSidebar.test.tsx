import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n, SIDEBAR_DEFAULT_WIDTH, useSidebarUiStore } from '@taskora/api';

import { ResizableSidebar, SIDEBAR_SETTLE_DELAY } from './ResizableSidebar';

// 侧边栏内容与拖动无关，换成占位避免拉起数据层
vi.mock('./Sidebar', () => ({ Sidebar: () => <aside>sidebar</aside> }));

const container = () => screen.getByTestId('desktop-sidebar');
const handle = () => screen.getByRole('separator', { name: 'Resize sidebar' });

describe('ResizableSidebar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useSidebarUiStore.setState({ width: SIDEBAR_DEFAULT_WIDTH, collapsed: false });
    // jsdom lacks pointer capture.
    HTMLElement.prototype.setPointerCapture = () => {};
  });

  it('dragging the right edge resizes; the store is written on release', () => {
    render(<ResizableSidebar />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 300, pointerId: 1 });

    expect(container()).toHaveStyle({ width: '300px' });
    expect(useSidebarUiStore.getState().width).toBe(240);

    fireEvent.pointerUp(handle(), { pointerId: 1 });
    expect(useSidebarUiStore.getState().width).toBe(300);
  });

  it('follows the pointer below the minimum, then springs back to it after a pause', () => {
    vi.useFakeTimers();
    render(<ResizableSidebar />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 900, pointerId: 1 });
    expect(container()).toHaveStyle({ width: '400px' });
    fireEvent.pointerMove(handle(), { clientX: 150, pointerId: 1 });
    expect(container()).toHaveStyle({ width: '150px' });
    fireEvent.pointerUp(handle(), { pointerId: 1 });

    // 松手后先停在原处
    act(() => vi.advanceTimersByTime(SIDEBAR_SETTLE_DELAY - 1));
    expect(container()).toHaveStyle({ width: '150px' });
    act(() => vi.advanceTimersByTime(1));
    expect(container()).toHaveStyle({ width: '200px' });
    expect(useSidebarUiStore.getState()).toMatchObject({ collapsed: false, width: 200 });
    vi.useRealTimers();
  });

  it('released below the threshold, it collapses after a pause and keeps its width', () => {
    vi.useFakeTimers();
    render(<ResizableSidebar />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 60, pointerId: 1 });
    expect(container()).toHaveStyle({ width: '60px' });
    fireEvent.pointerUp(handle(), { pointerId: 1 });
    expect(useSidebarUiStore.getState().collapsed).toBe(false);

    act(() => vi.advanceTimersByTime(SIDEBAR_SETTLE_DELAY));
    expect(container()).toHaveStyle({ width: '0px' });
    expect(useSidebarUiStore.getState()).toMatchObject({ collapsed: true, width: 240 });
    vi.useRealTimers();
  });

  it('dragging out from the collapsed edge expands it again', () => {
    vi.useFakeTimers();
    useSidebarUiStore.setState({ collapsed: true });
    render(<ResizableSidebar />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 150, pointerId: 1 });
    expect(container()).toHaveStyle({ width: '150px' });
    fireEvent.pointerUp(handle(), { pointerId: 1 });

    act(() => vi.advanceTimersByTime(SIDEBAR_SETTLE_DELAY));
    expect(useSidebarUiStore.getState()).toMatchObject({ collapsed: false, width: 200 });
    vi.useRealTimers();
  });

  it('double-click restores the default width', () => {
    useSidebarUiStore.setState({ width: 320 });
    render(<ResizableSidebar />);
    fireEvent.doubleClick(handle());
    expect(useSidebarUiStore.getState().width).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it('collapsed: the edge shows a reveal tab; clicking it expands without resetting the width', () => {
    vi.useFakeTimers();
    useSidebarUiStore.setState({ width: 320, collapsed: true });
    render(<ResizableSidebar />);
    expect(screen.getByTestId('sidebar-reveal-tab')).toBeInTheDocument();

    // 双击：首次单击即展开，第二次与 dblclick 不再恢复默认宽度，也不会停顿后又收起
    for (const timeStamp of [1000, 1200]) {
      fireEvent(handle(), pointerEvent('pointerdown', { button: 0, clientX: 0, timeStamp }));
      fireEvent.pointerUp(handle(), { pointerId: 1 });
    }
    fireEvent.doubleClick(handle());
    act(() => vi.advanceTimersByTime(SIDEBAR_SETTLE_DELAY));

    expect(useSidebarUiStore.getState()).toMatchObject({ collapsed: false, width: 320 });
    expect(screen.queryByTestId('sidebar-reveal-tab')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('arrow keys step the width and collapse past the minimum', () => {
    useSidebarUiStore.setState({ width: 216 });
    render(<ResizableSidebar />);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(useSidebarUiStore.getState().width).toBe(200);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(useSidebarUiStore.getState().collapsed).toBe(true);
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(useSidebarUiStore.getState()).toMatchObject({ collapsed: false, width: 200 });
  });
});

/** fireEvent 构造的事件无法指定 timeStamp，双击判定需要它。 */
function pointerEvent(
  type: string,
  { timeStamp, ...init }: MouseEventInit & { timeStamp: number },
): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
}
