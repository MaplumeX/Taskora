import type { CompactChange, EntityChange, HubChange } from '@taskora/engine';

export { SYNC_LOG_RETENTION_DAYS } from '@taskora/engine';

/** 待入日志的变更（seq 由日志分配）。 */
export type HubChangeDraft = Omit<EntityChange, 'seq'> | Omit<CompactChange, 'seq'>;

export interface SyncPullResult {
  changes: HubChange[];
  /** 本页覆盖到的 seq；无变更时为当前 seq。 */
  cursor: number;
  /** cursor 越界或早于保留窗口 → 设备必须 bootstrap。 */
  resync: boolean;
  /** 还有下一页（设备应继续 pull）。 */
  hasMore: boolean;
}

/** 单次 pull 最多返回的变更数。 */
export const SYNC_PULL_PAGE_SIZE = 1000;

/**
 * 同步变更日志（hub 侧 pull 面，ADR-0007）：每用户单调 seq 的 Change
 * Event 序列。
 *
 * seq 从 1 起步，1 本身不对应任何变更（counter 的 prunedThrough 初值即 1），
 * 因此 cursor 0（从未 bootstrap 的设备）恒被判 resync。
 *
 * resync 判定：
 * - cursor > 当前 seq：来自别的 hub 世代（如旧版内存缓冲以 Date.now()
 *   播种的 cursor），直接重建；
 * - cursor < prunedThrough：它之后的变更有一部分已被保留期清理。
 */
export abstract class SyncChangeLog {
  /**
   * 追加变更并分配 seq。tx 为调用方的事务客户端：变更与它描述的数据
   * 同事务提交，seq 顺序即提交顺序。
   */
  abstract append(tx: unknown, userId: string, changes: HubChangeDraft[]): Promise<void>;

  abstract pull(userId: string, cursor: number): Promise<SyncPullResult>;

  /** 已提交的最新 seq（bootstrap 的 cursor fence）。 */
  abstract currentSeq(userId: string): Promise<number>;
}
