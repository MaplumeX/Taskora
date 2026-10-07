import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPLETE_EXIT_MS,
  COMPLETE_HOLD_MS,
  PREVIEW_RELEASE_MS,
  useCompletionRhythm,
} from './useCompletionRhythm';

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('useCompletionRhythm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('勾选后先停留显示勾选态，停留 + 收起结束后提交一次', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionRhythm(false, commit));

    act(() => result.current.toggle());
    expect(result.current.pendingComplete).toBe(true);
    expect(result.current.exiting).toBe(false);

    act(() => vi.advanceTimersByTime(COMPLETE_HOLD_MS));
    expect(result.current.exiting).toBe(true);
    expect(commit).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(COMPLETE_EXIT_MS));
    expect(commit).toHaveBeenCalledOnce();
  });

  it('停留期内再次点击撤销，不提交', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionRhythm(false, commit));

    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(COMPLETE_HOLD_MS / 2));
    act(() => result.current.toggle());
    expect(result.current.pendingComplete).toBe(false);

    act(() => vi.advanceTimersByTime(COMPLETE_HOLD_MS + COMPLETE_EXIT_MS));
    expect(commit).not.toHaveBeenCalled();
  });

  it('收起阶段点击无效，仍只提交一次', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionRhythm(false, commit));

    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(COMPLETE_HOLD_MS));
    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(COMPLETE_EXIT_MS));
    expect(commit).toHaveBeenCalledOnce();
  });

  it('reduced-motion 下立即提交，不停留', () => {
    mockReducedMotion(true);
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionRhythm(false, commit));

    act(() => result.current.toggle());
    expect(commit).toHaveBeenCalledOnce();
    expect(result.current.pendingComplete).toBe(false);
  });

  it('已了结任务点击立即切回（重开），不走停留', () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionRhythm(true, commit));

    act(() => result.current.toggle());
    expect(commit).toHaveBeenCalledOnce();
    expect(result.current.pendingComplete).toBe(false);
  });
});

describe('useCompletionRhythm preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('勾上即 show；停留期内撤销则 clear', () => {
    const preview = { show: vi.fn(), clear: vi.fn() };
    const { result } = renderHook(() => useCompletionRhythm(false, vi.fn(), preview));

    act(() => result.current.toggle());
    expect(preview.show).toHaveBeenCalledOnce();
    expect(preview.clear).not.toHaveBeenCalled();

    act(() => result.current.toggle());
    expect(preview.clear).toHaveBeenCalledOnce();
  });

  it('提交后延迟 clear 兜底', () => {
    const preview = { show: vi.fn(), clear: vi.fn() };
    const commit = vi.fn();
    const { result } = renderHook(() => useCompletionRhythm(false, commit, preview));

    act(() => result.current.toggle());
    act(() => vi.advanceTimersByTime(COMPLETE_HOLD_MS + COMPLETE_EXIT_MS));
    expect(commit).toHaveBeenCalledOnce();
    expect(preview.clear).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(PREVIEW_RELEASE_MS));
    expect(preview.clear).toHaveBeenCalledOnce();
  });
});
