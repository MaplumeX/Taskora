import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { setHaptics } from '@taskora/api';

import { useSwipeToSelect } from './useSwipeToSelect';

function Harness({
  onSwipe,
  onSwipeRight,
  onClick,
  enabled,
}: {
  onSwipe: () => void;
  onSwipeRight?: () => void;
  onClick?: () => void;
  enabled?: boolean;
}) {
  const { handlers, offset, armed } = useSwipeToSelect(onSwipe, { enabled, onSwipeRight });
  return (
    <div data-testid="row" data-offset={offset} data-armed={armed} {...handlers} onClick={onClick}>
      row
    </div>
  );
}

function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  { x = 0, y = 0, pointerType = 'touch', pointerId = 1, elapsed = 0 } = {},
) {
  // elapsed：距上一个事件经过的毫秒数（hook 以 Date.now() 计时）。
  vi.advanceTimersByTime(elapsed);
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerType,
    pointerId,
    button: 0,
  });
  return fireEvent(screen.getByTestId('row'), event);
}

const row = () => screen.getByTestId('row');

describe('useSwipeToSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('左滑越过阈值后松手触发，行回弹归位', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} />);

    pointer('pointerdown', { x: 200, y: 10 });
    pointer('pointermove', { x: 150, y: 12, elapsed: 30 });
    expect(row().dataset.offset).toBe('-50');
    expect(row().dataset.armed).toBe('false');
    pointer('pointermove', { x: 120, y: 12, elapsed: 30 });
    expect(row().dataset.armed).toBe('true');
    pointer('pointerup', { x: 120, y: 12, elapsed: 30 });

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(row().dataset.offset).toBe('0');
  });

  it('跟手偏移不超过 maxOffset', () => {
    render(<Harness onSwipe={vi.fn()} />);
    pointer('pointerdown', { x: 300 });
    pointer('pointermove', { x: 100, elapsed: 30 });
    expect(row().dataset.offset).toBe('-88');
  });

  it('未越过阈值松手不触发', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} />);
    pointer('pointerdown', { x: 200 });
    pointer('pointermove', { x: 160, elapsed: 30 });
    pointer('pointerup', { x: 160, elapsed: 30 });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('纵向滑动（列表滚动）与右滑不认作左滑', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} />);

    pointer('pointerdown', { x: 200, y: 100 });
    pointer('pointermove', { x: 190, y: 40, elapsed: 30 });
    pointer('pointermove', { x: 100, y: 40, elapsed: 30 });
    pointer('pointerup', { x: 100, y: 40, elapsed: 30 });

    pointer('pointerdown', { x: 100 });
    pointer('pointermove', { x: 200, elapsed: 30 });
    pointer('pointerup', { x: 200, elapsed: 30 });

    expect(onSwipe).not.toHaveBeenCalled();
    expect(row().dataset.offset).toBe('0');
  });

  it('按住超过 lockAfter 才移动（长按拖拽）不认作左滑', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} />);
    pointer('pointerdown', { x: 200 });
    pointer('pointermove', { x: 100, elapsed: 400 });
    pointer('pointerup', { x: 100, elapsed: 400 });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(row().dataset.offset).toBe('0');
  });

  it('鼠标与禁用状态不响应', () => {
    const onSwipe = vi.fn();
    const { rerender } = render(<Harness onSwipe={onSwipe} />);
    pointer('pointerdown', { x: 200, pointerType: 'mouse' });
    pointer('pointermove', { x: 100, pointerType: 'mouse', elapsed: 30 });
    pointer('pointerup', { x: 100, pointerType: 'mouse', elapsed: 30 });

    rerender(<Harness onSwipe={onSwipe} enabled={false} />);
    pointer('pointerdown', { x: 200 });
    pointer('pointermove', { x: 100, elapsed: 30 });
    pointer('pointerup', { x: 100, elapsed: 30 });

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('左滑后的抬手 click 被抑制，普通点击不受影响', () => {
    const onClick = vi.fn();
    render(<Harness onSwipe={vi.fn()} onClick={onClick} />);

    pointer('pointerdown', { x: 200 });
    pointer('pointermove', { x: 150, elapsed: 30 });
    pointer('pointerup', { x: 150, elapsed: 30 });
    fireEvent.click(row());
    expect(onClick).not.toHaveBeenCalled();

    pointer('pointerdown', { x: 200 });
    pointer('pointerup', { x: 200, elapsed: 30 });
    fireEvent.click(row());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('有右滑回调时右滑越过阈值松手触发右滑，不触发左滑', () => {
    const onSwipe = vi.fn();
    const onSwipeRight = vi.fn();
    render(<Harness onSwipe={onSwipe} onSwipeRight={onSwipeRight} />);

    pointer('pointerdown', { x: 100, y: 10 });
    pointer('pointermove', { x: 300, y: 12, elapsed: 30 });
    expect(row().dataset.offset).toBe('88');
    expect(row().dataset.armed).toBe('true');
    pointer('pointerup', { x: 300, y: 12, elapsed: 30 });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(row().dataset.offset).toBe('0');
  });

  it('左滑禁用时右滑仍可用', () => {
    const onSwipe = vi.fn();
    const onSwipeRight = vi.fn();
    render(<Harness onSwipe={onSwipe} onSwipeRight={onSwipeRight} enabled={false} />);

    pointer('pointerdown', { x: 200 });
    pointer('pointermove', { x: 100, elapsed: 30 });
    pointer('pointerup', { x: 100, elapsed: 30 });
    pointer('pointerdown', { x: 100 });
    pointer('pointermove', { x: 200, elapsed: 30 });
    pointer('pointerup', { x: 200, elapsed: 30 });

    expect(onSwipe).not.toHaveBeenCalled();
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('越过阈值的那一刻给一次轻触感，来回越过各一次', () => {
    const impl = vi.fn();
    setHaptics(impl);
    try {
      render(<Harness onSwipe={vi.fn()} />);
      pointer('pointerdown', { x: 200 });
      pointer('pointermove', { x: 150, elapsed: 30 });
      expect(impl).not.toHaveBeenCalled();
      pointer('pointermove', { x: 120, elapsed: 30 });
      pointer('pointermove', { x: 110, elapsed: 30 });
      expect(impl).toHaveBeenCalledTimes(1);
      expect(impl).toHaveBeenCalledWith('tick');
      pointer('pointermove', { x: 160, elapsed: 30 });
      pointer('pointermove', { x: 120, elapsed: 30 });
      expect(impl).toHaveBeenCalledTimes(2);
    } finally {
      setHaptics(null);
    }
  });
});
