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

import { apiClient } from '@/api/client';
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

/** 注册/注销平台壳。桌面端 / Android 在 boot 时调用。 */
export function setUpdateShell(next: UpdateShell | null): void {
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

/**
 * 检查一次。manual：设置页「立即检查」，会清掉「跳过此版本」。并发调用
 * 合并为同一次请求。未注册平台壳时什么都不做。
 */
export function checkForUpdates({ manual = false } = {}): Promise<UpdateVerdict | null> {
  if (!shell) return Promise.resolve(null);
  if (inFlight) return inFlight;
  const store = useUpdateStore;
  if (manual) store.setState({ skippedVersion: null });
  store.setState({ checking: true });
  inFlight = (async () => {
    const current = shell;
    try {
      const { data } = await apiClient.get<HubHealth>('/health');
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
        readyVersion = (await current.prepare(target)) ? target : null;
      }
      store.setState({ verdict, readyVersion, failed: false, lastCheckedAt: Date.now() });
      return verdict;
    } catch (error) {
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

const DAY_MS = 24 * 60 * 60_000;
const TICK_MS = 60 * 60_000;

/**
 * 调度自动检查：启动延迟后查一次，之后每小时看一眼、距上次满 24 小时再查
 * （按墙钟而不是 24 小时定时器，休眠唤醒后不会漂移）；同步被 hub 以 426
 * 拒绝时立即查，拿到必须更新的目标版本。关闭自动检查时都不查。返回停止函数。
 */
export function initUpdateChecks({ startDelayMs = 10_000 } = {}): () => void {
  const autoCheck = () => useUpdateStore.getState().autoCheck;
  const due = () => {
    const last = useUpdateStore.getState().lastCheckedAt;
    return last === null || Date.now() - last >= DAY_MS;
  };
  const startTimer = setTimeout(() => {
    if (autoCheck()) void checkForUpdates();
  }, startDelayMs);
  const tickTimer = setInterval(() => {
    if (autoCheck() && due()) void checkForUpdates();
  }, TICK_MS);
  const unsubscribe = useSyncStatusStore.subscribe((state, prev) => {
    if (state.status === 'upgrade-required' && prev.status !== 'upgrade-required' && autoCheck()) {
      void checkForUpdates();
    }
  });
  return () => {
    clearTimeout(startTimer);
    clearInterval(tickTimer);
    unsubscribe();
  };
}
