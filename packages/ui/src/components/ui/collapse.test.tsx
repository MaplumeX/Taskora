import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { Collapse } from './collapse';

describe('Collapse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as Partial<Element>).animate;
  });

  function mockAnimate() {
    const calls: { keyframes: Keyframe[]; animation: Animation }[] = [];
    Element.prototype.animate = function (keyframes: Keyframe[]) {
      const animation = { cancel: vi.fn(), onfinish: null } as unknown as Animation;
      calls.push({ keyframes, animation });
      return animation;
    } as Element['animate'];
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 120),
    );
    return calls;
  }

  it('首次渲染不播放动画', () => {
    const calls = mockAnimate();
    render(<Collapse open>内容</Collapse>);
    expect(screen.getByText('内容')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('展开：挂载内容并从 0 撑开到自然高度', () => {
    const calls = mockAnimate();
    const { rerender } = render(<Collapse open={false}>内容</Collapse>);
    expect(screen.queryByText('内容')).toBeNull();

    rerender(<Collapse open>内容</Collapse>);
    expect(screen.getByText('内容')).toBeTruthy();
    expect(calls[0].keyframes).toEqual([
      { height: '0px', opacity: 0 },
      { height: '120px', opacity: 1 },
    ]);
  });

  it('收起：动画结束后才卸载内容', () => {
    const calls = mockAnimate();
    const { rerender } = render(<Collapse open>内容</Collapse>);
    rerender(<Collapse open={false}>内容</Collapse>);

    expect(screen.getByText('内容')).toBeTruthy();
    expect(calls[0].keyframes).toEqual([
      { height: '120px', opacity: 1 },
      { height: '0px', opacity: 0 },
    ]);

    act(() => calls[0].animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent));
    expect(screen.queryByText('内容')).toBeNull();
  });

  it('不支持 WAAPI 时立即切换', () => {
    const { rerender } = render(<Collapse open>内容</Collapse>);
    rerender(<Collapse open={false}>内容</Collapse>);
    expect(screen.queryByText('内容')).toBeNull();
  });
});
