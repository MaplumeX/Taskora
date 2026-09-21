import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import * as React from 'react';

import { useLongPress } from './useLongPress';

function Harness({
  onLongPress,
  onClick,
  delay,
}: {
  onLongPress: (p: { x: number; y: number }) => void;
  onClick?: () => void;
  delay?: number;
}) {
  const handlers = useLongPress(onLongPress, { delay });
  return (
    <div data-testid="row" {...handlers} onClick={onClick}>
      row
    </div>
  );
}

function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  { x = 0, y = 0, pointerType = 'touch', pointerId = 1, button = 0 } = {},
) {
  return fireEvent(
    screen.getByTestId('row'),
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerType,
      pointerId,
      button,
    }),
  );
}

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires after the delay with the press origin (touch)', () => {
    const onLongPress = vi.fn();
    render(<Harness onLongPress={onLongPress} />);

    pointer('pointerdown', { x: 30, y: 40 });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith({ x: 30, y: 40 });
  });

  it('does not fire for mouse pointers', () => {
    const onLongPress = vi.fn();
    render(<Harness onLongPress={onLongPress} />);

    pointer('pointerdown', { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels when the finger moves beyond tolerance before firing', () => {
    const onLongPress = vi.fn();
    render(<Harness onLongPress={onLongPress} />);

    pointer('pointerdown', { x: 0, y: 0 });
    pointer('pointermove', { x: 20, y: 0 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels when the finger lifts before firing', () => {
    const onLongPress = vi.fn();
    render(<Harness onLongPress={onLongPress} />);

    pointer('pointerdown');
    pointer('pointerup');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('suppresses the click that follows a fired long-press', () => {
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    render(<Harness onLongPress={onLongPress} onClick={onClick} />);

    pointer('pointerdown');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onLongPress).toHaveBeenCalled();
    pointer('pointerup');
    fireEvent.click(screen.getByTestId('row'));
    expect(onClick).not.toHaveBeenCalled();

    // 抑制只对长按后的第一次 click 生效，之后的正常点击不受影响。
    fireEvent.click(screen.getByTestId('row'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores a second finger while tracking the first', () => {
    const onLongPress = vi.fn();
    render(<Harness onLongPress={onLongPress} />);

    pointer('pointerdown', { x: 10, y: 10, pointerId: 1 });
    pointer('pointerdown', { x: 100, y: 100, pointerId: 2 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // 以第一根手指的按下点触发，且只触发一次。
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith({ x: 10, y: 10 });
  });
});
