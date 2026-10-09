export type PreloadPlatform = 'desktop' | 'web';

interface ConnectionInfo {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}

/** 网络信息 API 不可用时仍允许有限预加载；桌面本地资源不受网络限制。 */
export function canPreloadCode(platform: PreloadPlatform): boolean {
  if (platform === 'desktop') return true;
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  return (
    navigator.onLine !== false &&
    !connection?.saveData &&
    !['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '') &&
    !(connection?.downlink !== undefined && connection.downlink < 1)
  );
}

/** 一次只启动一个模块，每次等待下一次空闲；销毁时取消尚未执行的工作。 */
export function startIdlePreload(
  tasks: readonly (() => Promise<unknown>)[],
  options: { canRun(): boolean; isReady(): boolean },
): () => void {
  let stopped = false;
  let index = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;

  const schedule = () => {
    if (stopped || index >= tasks.length) return;
    if (!options.canRun()) return;
    if (document.visibilityState === 'hidden' || !options.isReady()) {
      timer = setTimeout(schedule, 500);
      return;
    }
    if (typeof window.requestIdleCallback === 'function') {
      // 不设强制执行的 timeout：持续交互时让出主线程。
      idle = window.requestIdleCallback(run);
    } else {
      timer = setTimeout(run, 500);
    }
  };

  const run = () => {
    idle = undefined;
    if (stopped || !options.canRun()) return;
    if (document.visibilityState === 'hidden' || !options.isReady()) {
      schedule();
      return;
    }
    const task = tasks[index++];
    void task()
      .catch(() => undefined)
      .finally(schedule);
  };

  // 等首屏绘制；尚未就绪时继续等待，避免启动时立刻批量 import。
  timer = setTimeout(schedule, 500);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
