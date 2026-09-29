import type { HubChange } from '@taskora/engine';

import {
  SYNC_PULL_PAGE_SIZE,
  SyncChangeLog,
  type HubChangeDraft,
  type SyncPullResult,
} from './sync-change-log';

/**
 * 进程内的 SyncChangeLog（单元测试替身）：与 PrismaSyncChangeLog 相同的
 * seq / resync 语义；保留期以条数模拟（超出 capacity 的最早条目被清理并
 * 推进 prunedThrough）。忽略事务参数。
 */
export class InMemorySyncChangeLog extends SyncChangeLog {
  private readonly users = new Map<
    string,
    { seq: number; prunedThrough: number; rows: HubChange[] }
  >();

  constructor(private readonly capacity = 500) {
    super();
  }

  async append(_tx: unknown, userId: string, changes: HubChangeDraft[]): Promise<void> {
    const state = this.stateFor(userId);
    for (const change of changes) {
      state.seq += 1;
      state.rows.push({ ...change, seq: state.seq } as HubChange);
    }
    while (state.rows.length > this.capacity) {
      state.prunedThrough = state.rows.shift()!.seq;
    }
  }

  async pull(userId: string, cursor: number): Promise<SyncPullResult> {
    const state = this.stateFor(userId);
    if (cursor > state.seq || cursor < state.prunedThrough) {
      return { changes: [], cursor: state.seq, resync: true, hasMore: false };
    }
    const pending = state.rows.filter((change) => change.seq > cursor);
    const page = pending.slice(0, SYNC_PULL_PAGE_SIZE);
    return {
      changes: page,
      cursor: page.length > 0 ? page[page.length - 1].seq : state.seq,
      resync: false,
      hasMore: pending.length > page.length,
    };
  }

  async currentSeq(userId: string): Promise<number> {
    return this.stateFor(userId).seq;
  }

  private stateFor(userId: string) {
    let state = this.users.get(userId);
    if (!state) {
      state = { seq: 1, prunedThrough: 1, rows: [] };
      this.users.set(userId, state);
    }
    return state;
  }
}
