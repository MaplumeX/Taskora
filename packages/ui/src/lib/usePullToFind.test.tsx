import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { usePullToFind } from './usePullToFind';

function Harness({ onPull, enabled }: { onPull: () => void; enabled?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { distance, armed } = usePullToFind(ref, onPull, { enabled });
  return (
    <div ref={ref} data-testid="scroll" data-distance={distance} data-armed={armed}>
      list
    </div>
  );
}

const scroll = () => screen.getByTestId('scroll');

function touch(
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  { x = 100, y = 0, elapsed = 0, fingers = 1 } = {},
) {
  // elapsed：距上一个事件经过的毫秒数（hook 以 Date.now() 计时）。
  vi.advanceTimersByTime(elapsed);
  const touches = type === 'touchEnd' ? [] : Array(fingers).fill({ clientX: x, clientY: y });
  fireEvent[type](scroll(), { touches });
}

describe('usePullToFind', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('在顶部下拉：指示器按一半距离跟手，越过阈值松手触发并收回', () => {
    const onPull = vi.fn();
    render(<Harness onPull={onPull} />);

    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 90, elapsed: 30 });
    expect(scroll().dataset.distance).toBe('40');
    expect(scroll().dataset.armed).toBe('false');
    touch('touchMove', { y: 150, elapsed: 30 });
    expect(scroll().dataset.distance).toBe('70');
    expect(scroll().dataset.armed).toBe('true');
    touch('touchEnd');

    expect(onPull).toHaveBeenCalledTimes(1);
    expect(scroll().dataset.distance).toBe('0');
  });

  it('未越过阈值松手：不触发', () => {
    const onPull = vi.fn();
    render(<Harness onPull={onPull} />);
    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 100, elapsed: 30 });
    touch('touchEnd');
    expect(onPull).not.toHaveBeenCalled();
  });

  it('指示器高度有上限', () => {
    render(<Harness onPull={vi.fn()} />);
    touch('touchStart', { y: 0 });
    touch('touchMove', { y: 600, elapsed: 30 });
    expect(scroll().dataset.distance).toBe('96');
  });

  it('列表不在顶部：只是正常滚动', () => {
    const onPull = vi.fn();
    render(<Harness onPull={onPull} />);
    scroll().scrollTop = 40;
    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 200, elapsed: 30 });
    touch('touchEnd');
    expect(scroll().dataset.distance).toBe('0');
    expect(onPull).not.toHaveBeenCalled();
  });

  it('先横向移动（左滑多选）或向上：整次手势放弃', () => {
    const onPull = vi.fn();
    render(<Harness onPull={onPull} />);
    touch('touchStart', { x: 200, y: 10 });
    touch('touchMove', { x: 150, y: 15, elapsed: 30 });
    touch('touchMove', { x: 150, y: 200, elapsed: 30 });
    touch('touchEnd');
    touch('touchStart', { y: 100 });
    touch('touchMove', { y: 50, elapsed: 30 });
    touch('touchMove', { y: 300, elapsed: 30 });
    touch('touchEnd');
    expect(onPull).not.toHaveBeenCalled();
  });

  it('按住超过 lockAfter 才移动（长按拖拽）：不认作下拉', () => {
    const onPull = vi.fn();
    render(<Harness onPull={onPull} />);
    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 200, elapsed: 300 });
    touch('touchEnd');
    expect(onPull).not.toHaveBeenCalled();
  });

  it('多指触摸不响应', () => {
    const onPull = vi.fn();
    render(<Harness onPull={onPull} />);
    touch('touchStart', { y: 10, fingers: 2 });
    touch('touchMove', { y: 200, elapsed: 30 });
    touch('touchEnd');
    expect(onPull).not.toHaveBeenCalled();
  });

  it('enabled 为 false：不响应', () => {
    const onPull = vi.fn();
    render(<Harness onPull={onPull} enabled={false} />);
    touch('touchStart', { y: 10 });
    touch('touchMove', { y: 200, elapsed: 30 });
    touch('touchEnd');
    expect(scroll().dataset.distance).toBe('0');
    expect(onPull).not.toHaveBeenCalled();
  });
});
