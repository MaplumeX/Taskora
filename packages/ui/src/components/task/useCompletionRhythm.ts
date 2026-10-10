import * as React from 'react';

import { useLoggingMode } from '@taskora/api';

/** 勾选后保持勾选态的停留时长；期间再次点击可撤销。 */
export const COMPLETE_HOLD_MS = 600;
/** 停留结束后行收起 + 淡出的时长（与 TaskItem 的 transition 时长一致）。 */
export const COMPLETE_EXIT_MS = 200;
/** 提交后多久仍未被写入接管的预览视为失效，撤回。 */
export const PREVIEW_RELEASE_MS = 1000;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 任务完成节奏（Things 3 式）：勾上 → 停留 {@link COMPLETE_HOLD_MS} → 收起离开
 * {@link COMPLETE_EXIT_MS} → 提交完成。
 *
 * - 停留期内再次点击撤销，不提交。
 * - 收起阶段不再响应点击（行即将离开）。
 * - reduced-motion 下不停留、不收起，立即提交。
 * - 每天 / 手动模式（Logging Mode）下行不会离开视图：同样立即提交，不收起；
 *   再点一次就是重开，不需要撤销窗。
 * - 组件卸载不取消计时：用户已勾选，切走视图也应完成。
 * - preview：勾上即调用 show（如项目进度饼提前计入），撤销时 clear；提交后
 *   {@link PREVIEW_RELEASE_MS} 再 clear 兜底（写入已接管时为空操作）。
 */
export function useCompletionRhythm(
  settled: boolean,
  onToggleComplete: () => void,
  preview?: { show: () => void; clear: () => void },
) {
  const [phase, setPhase] = React.useState<'idle' | 'holding' | 'exiting'>('idle');
  const holdTimer = React.useRef<number>();
  const commitRef = React.useRef(onToggleComplete);
  commitRef.current = onToggleComplete;
  const previewRef = React.useRef(preview);
  previewRef.current = preview;
  const rowStays = useLoggingMode() !== 'IMMEDIATE';

  const toggle = () => {
    if (settled) {
      onToggleComplete();
      return;
    }
    if (phase === 'exiting') return;
    if (phase === 'holding') {
      window.clearTimeout(holdTimer.current);
      previewRef.current?.clear();
      setPhase('idle');
      return;
    }
    if (rowStays || prefersReducedMotion()) {
      onToggleComplete();
      return;
    }
    setPhase('holding');
    previewRef.current?.show();
    holdTimer.current = window.setTimeout(() => {
      setPhase('exiting');
      window.setTimeout(() => {
        commitRef.current();
        const release = previewRef.current?.clear;
        if (release) window.setTimeout(release, PREVIEW_RELEASE_MS);
      }, COMPLETE_EXIT_MS);
    }, COMPLETE_HOLD_MS);
  };

  return {
    /** 视觉上是否显示为勾选（停留与收起阶段）。 */
    pendingComplete: phase !== 'idle',
    exiting: phase === 'exiting',
    toggle,
  };
}
