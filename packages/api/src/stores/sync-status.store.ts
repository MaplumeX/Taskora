import { create } from 'zustand';

/**
 * 同步状态 store（V2 spec：离线可见性）。
 *
 * 三态指示（已同步 / 同步中 / 离线·N 条待同步）由桌面端 syncNow 的
 * 成败驱动（不用 navigator.onLine——服务器不可达不应被假在线掩盖）。
 * web 端无 Engine，状态恒为 idle，指示器不渲染。
 */

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';

interface SyncStatusStore {
  status: SyncStatus;
  /** 离线时 Outbox 中未同步的写操作条数。 */
  pendingCount: number;
  set: (status: SyncStatus, pendingCount?: number) => void;
}

export const useSyncStatusStore = create<SyncStatusStore>()((set) => ({
  status: 'idle',
  pendingCount: 0,
  set: (status, pendingCount = 0) => set({ status, pendingCount }),
}));

/** 桌面端引擎调度器写入（成功 → synced；失败 → offline + pendingCount）。 */
export function setSyncStatus(status: SyncStatus, pendingCount = 0): void {
  useSyncStatusStore.getState().set(status, pendingCount);
}
