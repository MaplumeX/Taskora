import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { Collapse } from './collapse';

describe('Collapse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as Partial<Element>).animate;
  });

  function mockAnimate() {
    const calls: {
      keyframes: Keyframe[];
      options: KeyframeAnimationOptions;
      animation: Animation;
    }[] = [];
    Element.prototype.animate = function (
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const animation = { cancel: vi.fn(), onfinish: null } as unknown as Animation;
      calls.push({ keyframes, options, animation });
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

    act(() => calls[0].animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent));
    expect(calls[0].animation.cancel).toHaveBeenCalledOnce();
    expect(screen.getByText('内容').style.overflow).toBe('');
    expect(screen.getByText('内容')).toBeInTheDocument();
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
    // 浏览器先结束动画，随后才调用 onfinish；末帧必须覆盖这段时间。
    expect(calls[0].options.fill).toBe('forwards');

    act(() => calls[0].animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent));
    expect(screen.queryByText('内容')).toBeNull();
    expect(calls[0].animation.cancel).toHaveBeenCalledOnce();
  });

  it('收起中重新展开：接续当前高度，取消旧动画后仍保留内容', () => {
    const calls = mockAnimate();
    const { rerender } = render(<Collapse open>内容</Collapse>);
    rerender(<Collapse open={false}>内容</Collapse>);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValueOnce(new DOMRect(0, 0, 200, 50))
      .mockReturnValue(new DOMRect(0, 0, 200, 120));
    rerender(<Collapse open>内容</Collapse>);

    expect(calls[0].animation.cancel).toHaveBeenCalledOnce();
    expect(calls[0].animation.onfinish).toBeNull();
    expect(calls[1].keyframes).toEqual([
      { height: '50px', opacity: 0 },
      { height: '120px', opacity: 1 },
    ]);
    act(() => calls[1].animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent));
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('动画期间卸载：取消动画并移除结束回调', () => {
    const calls = mockAnimate();
    const { rerender, unmount } = render(<Collapse open>内容</Collapse>);
    rerender(<Collapse open={false}>内容</Collapse>);
    unmount();

    expect(calls[0].animation.cancel).toHaveBeenCalledOnce();
    expect(calls[0].animation.onfinish).toBeNull();
  });

  it('reveal：收起时先淡出完，展开时先腾出空间再浮现，并在展开开始时回调', () => {
    const calls = mockAnimate();
    const onOpen = vi.fn();
    const { rerender } = render(
      <Collapse open reveal onOpen={onOpen}>
        内容
      </Collapse>,
    );
    expect(onOpen).not.toHaveBeenCalled();

    rerender(
      <Collapse open={false} reveal onOpen={onOpen}>
        内容
      </Collapse>,
    );
    expect(calls[0].keyframes).toEqual([
      { height: '120px', opacity: 1 },
      { opacity: 0, offset: 0.6 },
      { height: '0px', opacity: 0 },
    ]);
    expect(onOpen).not.toHaveBeenCalled();
    act(() => calls[0].animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent));

    rerender(
      <Collapse open reveal onOpen={onOpen}>
        内容
      </Collapse>,
    );
    expect(calls[1].keyframes).toEqual([
      { height: '0px', opacity: 0 },
      { opacity: 0, offset: 0.3 },
      { height: '120px', opacity: 1 },
    ]);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen.mock.calls[0][0]).toHaveTextContent('内容');
  });

  it('不支持 WAAPI 时立即切换', () => {
    const { rerender } = render(<Collapse open>内容</Collapse>);
    rerender(<Collapse open={false}>内容</Collapse>);
    expect(screen.queryByText('内容')).toBeNull();
  });
});
