/**
 * 客户端更新检查（ADR-0026）：查询所连 hub 的 `/health`，按 evaluateUpdate
 * 判定，再让平台壳准备 hub 版本的安装包。
 *
 * 平台相关的部分收敛在 UpdateShell 后面，由桌面端 / Android 在 boot 时注册
 * （web 随 hub 镜像更新，不注册 → 整个功能不可用，设置页据此隐藏）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { MIN_HUB_PROTOCOL_VERSION, SYNC_PROTOCOL_VERSION } from '@taskora/engine';

import { apiClient, onApiBaseUrlChange } from '@/api/client';
import { useSyncStatusStore } from '@/stores/sync-status.store';
import { getAppVersion } from '@/utils/appInfo';

import { evaluateUpdate, type HubHealth, type UpdateVerdict } from './evaluate';

export interface UpdateShell {
  /** 提示按钮的动作：桌面端安装后重启，Android 前往下载。 */
  readonly action: 'restart' | 'download';
  /**
   * 准备目标版本：本平台有该版本的安装包时返回 true。桌面端顺带在后台下载
   * 好；Android 只确认 APK 存在。目标缺失（构建失败、尚未上传）返回 false。
   */
  prepare(version: string): Promise<boolean>;
  /** 桌面端：安装并重启；Android：打开 APK 下载链接。 */
  apply(version: string): Promise<void>;
}

let shell: UpdateShell | null = null;
let preparedVersion: string | null = null;

/** 注册/注销平台壳。桌面端 / Android 在 boot 时调用。 */
export function setUpdateShell(next: UpdateShell | null): void {
  if (next !== shell) preparedVersion = null;
  shell = next;
}

export function getUpdateShell(): UpdateShell | null {
  return shell;
}

interface UpdateState {
  /** 自动检查更新（仅本机，不跨设备同步）。 */
  autoCheck: boolean;
  /** 「跳过此版本」：只对可选更新生效。 */
  skippedVersion: string | null;
  lastCheckedAt: number | null;
  /** 最近一次成功检查的结论；检查失败时保留上次的。 */
  verdict: UpdateVerdict | null;
  /** 平台壳已准备好的版本。 */
  readyVersion: string | null;
  checking: boolean;
  /** 最近一次检查失败（网络 / 服务器不可达）。 */
  failed: boolean;
  setAutoCheck: (autoCheck: boolean) => void;
  skipVersion: (version: string) => void;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set) => ({
      autoCheck: true,
      skippedVersion: null,
      lastCheckedAt: null,
      verdict: null,
      readyVersion: null,
      checking: false,
      failed: false,
      setAutoCheck: (autoCheck) => set({ autoCheck }),
      skipVersion: (version) => set({ skippedVersion: version }),
    }),
    {
      name: 'taskora-updates',
      partialize: ({ autoCheck, skippedVersion, lastCheckedAt }) => ({
        autoCheck,
        skippedVersion,
        lastCheckedAt,
      }),
    },
  ),
);

/** 待提示的更新：必须更新（client-too-old）不受「跳过此版本」影响。 */
export function selectPendingUpdate(
  state: Pick<UpdateState, 'verdict' | 'readyVersion' | 'skippedVersion'>,
): { version: string; required: boolean } | null {
  const { verdict, readyVersion } = state;
  if (!verdict || !readyVersion || !('hubVersion' in verdict)) return null;
  if (verdict.hubVersion !== readyVersion) return null;
  if (verdict.kind === 'client-too-old') return { version: readyVersion, required: true };
  if (verdict.kind === 'update-available' && state.skippedVersion !== readyVersion) {
    return { version: readyVersion, required: false };
  }
  return null;
}

let inFlight: Promise<UpdateVerdict | null> | null = null;
let serverGeneration = 0;

/**
 * 检查一次。manual：设置页「立即检查」，会清掉「跳过此版本」。并发调用
 * 合并为同一次请求。未注册平台壳时什么都不做。
 */
export function checkForUpdates({ manual = false } = {}): Promise<UpdateVerdict | null> {
  if (!shell) return Promise.resolve(null);
  const store = useUpdateStore;
  if (manual) store.setState({ skippedVersion: null });
  if (inFlight) return inFlight;
  store.setState({ checking: true });
  inFlight = (async () => {
    const current = shell;
    const baseURL = apiClient.defaults.baseURL;
    const generation = serverGeneration;
    const isCurrent = () =>
      generation === serverGeneration &&
      baseURL === apiClient.defaults.baseURL &&
      current === shell;
    try {
      const { data } = await apiClient.get<HubHealth>('/health', { baseURL, timeout: 15_000 });
      if (!isCurrent()) return null;
      const verdict = evaluateUpdate(
        {
          appVersion: getAppVersion(),
          protocolVersion: SYNC_PROTOCOL_VERSION,
          minHubProtocolVersion: MIN_HUB_PROTOCOL_VERSION,
        },
        data ?? {},
      );
      let readyVersion: string | null = null;
      const target =
        (verdict.kind === 'update-available' || verdict.kind === 'client-too-old') &&
        verdict.hubVersion;
      const skipped =
        verdict.kind === 'update-available' && store.getState().skippedVersion === target;
      if (target && !skipped && current) {
        if (preparedVersion !== target) {
          const prepared = await current.prepare(target);
          if (current === shell) preparedVersion = prepared ? target : null;
        }
        readyVersion = preparedVersion === target ? target : null;
      }
      if (!isCurrent()) return null;
      store.setState({ verdict, readyVersion, failed: false, lastCheckedAt: Date.now() });
      return verdict;
    } catch (error) {
      if (!isCurrent()) return null;
      console.warn('[updates] 检查更新失败', error);
      store.setState({ failed: true });
      return null;
    } finally {
      store.setState({ checking: false });
      inFlight = null;
    }
  })();
  return inFlight;
}

const TICK_MS = 60 * 60_000;
const FOREGROUND_THROTTLE_MS = 5 * 60_000;

/**
 * 启动 10 秒后检查，运行期间每小时检查。回前台 / 恢复网络按 5 分钟节流，
 * 切换服务器 / 同步被 hub 以 426 拒绝时立即检查。关闭自动检查时都不查。
 * 返回停止函数，清理定时器与监听。
 */
export function initUpdateChecks({ startDelayMs = 10_000 } = {}): () => void {
  const autoCheck = () => useUpdateStore.getState().autoCheck;
  let stopped = false;
  let lastAttemptAt: number | null = null;
  const check = () => {
    if (stopped || !autoCheck()) return;
    lastAttemptAt = Date.now();
    void checkForUpdates();
  };
  const checkAfterResume = () => {
    const last = Math.max(lastAttemptAt ?? 0, useUpdateStore.getState().lastCheckedAt ?? 0);
    if (Date.now() - last >= FOREGROUND_THROTTLE_MS) check();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') checkAfterResume();
  };
  const startTimer = setTimeout(check, startDelayMs);
  const tickTimer = setInterval(check, TICK_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  window.addEventListener('online', checkAfterResume);
  const unsubscribeServer = onApiBaseUrlChange(() => {
    serverGeneration++;
    lastAttemptAt = null;
    useUpdateStore.setState({
      verdict: null,
      readyVersion: null,
      lastCheckedAt: null,
      failed: false,
    });
    // 串行准备安装包：旧服务器的结果失效，等它完成后再查当前服务器，
    // 避免两个下载互相覆盖原生壳保存的待安装版本。
    if (inFlight) void inFlight.then(check);
    else check();
  });
  const unsubscribe = useSyncStatusStore.subscribe((state, prev) => {
    if (state.status === 'upgrade-required' && prev.status !== 'upgrade-required' && autoCheck()) {
      check();
    }
  });
  return () => {
    stopped = true;
    clearTimeout(startTimer);
    clearInterval(tickTimer);
    unsubscribe();
    unsubscribeServer();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('online', checkAfterResume);
  };
}
