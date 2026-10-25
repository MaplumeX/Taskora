import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useDragToDismiss } from './useDragToDismiss';

function Harness({ onDismiss, onItem }: { onDismiss: () => void; onItem?: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { offset, dragging, dismissed } = useDragToDismiss(ref, onDismiss);
  return (
    <div
      ref={ref}
      data-testid="sheet"
      data-offset={offset}
      data-dragging={dragging}
      data-dismissed={dismissed}
    >
      <button type="button" onClick={onItem}>
        item
      </button>
    </div>
  );
}

const sheet = () => screen.getByTestId('sheet');

function touch(
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  { x = 100, y = 0, elapsed = 0, fingers = 1 } = {},
) {
  // elapsed：距上一个事件经过的毫秒数（hook 以 Date.now() 计速度）。
  vi.advanceTimersByTime(elapsed);
  const touches = type === 'touchEnd' ? [] : Array(fingers).fill({ clientX: x, clientY: y });
  fireEvent[type](sheet(), { touches });
}

describe('useDragToDismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('下拉跟手，越过阈值松手关闭，offset 停在松手处', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 60, elapsed: 100 });
    expect(sheet().dataset.offset).toBe('50');
    expect(sheet().dataset.dragging).toBe('true');
    touch('touchMove', { y: 110, elapsed: 200 });
    touch('touchEnd');

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(sheet().dataset.dismissed).toBe('true');
    expect(sheet().dataset.offset).toBe('100');
  });

  it('未越过阈值、慢速松手：弹回且不关闭', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 40, elapsed: 200 });
    touch('touchMove', { y: 60, elapsed: 200 });
    touch('touchEnd');
    expect(onDismiss).not.toHaveBeenCalled();
    expect(sheet().dataset.offset).toBe('0');
    expect(sheet().dataset.dragging).toBe('false');
  });

  it('快速下甩：未越过阈值也关闭', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 30, elapsed: 20 });
    touch('touchMove', { y: 60, elapsed: 20 });
    touch('touchEnd');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('向上推不跟手', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    touch('touchStart', { y: 200 });
    touch('touchMove', { y: 100, elapsed: 30 });
    touch('touchMove', { y: 300, elapsed: 30 });
    touch('touchEnd');
    expect(sheet().dataset.offset).toBe('0');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('横向为主的手势放弃', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    touch('touchStart', { x: 100, y: 10 });
    touch('touchMove', { x: 160, y: 30, elapsed: 30 });
    touch('touchMove', { x: 160, y: 200, elapsed: 30 });
    touch('touchEnd');
    expect(sheet().dataset.offset).toBe('0');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('拖动过的手势吞掉随后的 click；普通点按照常触发', () => {
    const onItem = vi.fn();
    render(<Harness onDismiss={vi.fn()} onItem={onItem} />);

    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 40, elapsed: 200 });
    touch('touchEnd');
    fireEvent.click(screen.getByText('item'));
    expect(onItem).not.toHaveBeenCalled();

    touch('touchStart', { y: 10 });
    touch('touchEnd');
    fireEvent.click(screen.getByText('item'));
    expect(onItem).toHaveBeenCalledTimes(1);
  });
});
