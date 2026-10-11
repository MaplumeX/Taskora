import * as React from 'react';

/** 与 tokens.css 的 --dur-expand / --ease-expand 一致（同任务详情展开）。 */
const EXPAND_MS = 200;
const EXPAND_EASING = 'cubic-bezier(0.45, 0, 0.2, 1)';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface CollapseProps {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * 折叠区块：展开时高度从 0 撑开并淡入，收起时收回 0 再卸载内容（折叠区
 * 可能很长，也不该残留拖拽放置目标）。首次渲染不播放；动画中途反向时从
 * 当前可见高度接续。不支持 WAAPI（jsdom）或 reduced-motion 时立即切换。
 *
 * 外层 flex gap 会在卸载瞬间跳一下：区块与上方的间距请放在 className 的
 * padding 里，让它随高度一起收起。
 */
export function Collapse({ open, className, children }: CollapseProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const animationRef = React.useRef<Animation | null>(null);
  const mountedRef = React.useRef(false);
  const [present, setPresent] = React.useState(open);
  if (open && !present) setPresent(true);

  React.useLayoutEffect(
    () => () => {
      const animation = animationRef.current;
      if (animation) {
        animation.onfinish = null;
        animation.cancel();
        animationRef.current = null;
      }
    },
    [present],
  );

  React.useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const element = ref.current;
    if (!element || typeof element.animate !== 'function' || prefersReducedMotion()) {
      if (!open) setPresent(false);
      return;
    }
    const running = animationRef.current;
    const visible = element.getBoundingClientRect().height;
    if (running) {
      running.onfinish = null;
      running.cancel();
    }
    const natural = element.getBoundingClientRect().height;
    const from = running ? visible : open ? 0 : natural;
    const to = open ? natural : 0;
    element.style.overflow = 'hidden';
    const animation = element.animate(
      [
        { height: `${from}px`, opacity: open ? 0 : 1 },
        { height: `${to}px`, opacity: open ? 1 : 0 },
      ],
      { duration: EXPAND_MS, easing: EXPAND_EASING, fill: 'forwards' },
    );
    animationRef.current = animation;
    animation.onfinish = () => {
      if (open) {
        animationRef.current = null;
        animation.cancel();
        element.style.overflow = '';
      } else {
        // 保持末帧及裁剪直到 React 卸载，避免动画结束后恢复自然高度而闪现。
        setPresent(false);
      }
    };
  }, [open]);

  if (!present) return null;
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
