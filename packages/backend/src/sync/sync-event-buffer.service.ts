import { Injectable } from '@nestjs/common';

import type { HubChange } from '@taskora/engine';

/**
 * 每用户的同步事件缓冲（hub 侧 pull 面）。
 *
 * 语义与 ADR-0005 的 ChangeEventHub 相同：内存 ring buffer、单调 seq
 * 以 Date.now() 播种（hub 重启后 seq 跳变 → 持旧 cursor 的设备被推入
 * resync → bootstrap 重建）。区别在于承载的是同步协议的 HubChange
 * （字段级 EntityChange / Compact Event），且发布时按实体内容去重，
 * 避免「设备 push 直发 + collector 回声」双路重复推流。
 */
@Injectable()
export class SyncEventBuffer {
  private readonly bufferSize = 500;

  private readonly users = new Map<
    string,
    {
      nextSeq: number;
      buffer: HubChange[];
      /** `${entity}:${id}` → 最近一次发布的序列化指纹。 */
      lastFingerprint: Map<string, string>;
    }
  >();

  /**
   * 发布一条变更并分配 seq。contentFingerprint 提供时做内容去重：
   * 同实体同内容不重复推流（幂等回声）。
   */
  publish(userId: string, change: HubChange, contentFingerprint?: string): HubChange | null {
    const state = this.stateFor(userId);
    if (contentFingerprint !== undefined) {
      const key = `${change.kind === 'entity' ? change.entity : 'compact'}:${change.kind === 'entity' ? change.id : change.ids.join(',')}`;
      if (state.lastFingerprint.get(key) === contentFingerprint) {
        return null;
      }
      state.lastFingerprint.set(key, contentFingerprint);
    }
    const framed = { ...change, seq: state.nextSeq++ };
    state.buffer.push(framed);
    if (state.buffer.length > this.bufferSize) {
      state.buffer.splice(0, state.buffer.length - this.bufferSize);
    }
    return framed;
  }

  /** 增量拉取；缺口超出缓冲或 cursor 越界 → resync。 */
  pull(userId: string, cursor: number): { changes: HubChange[]; cursor: number; resync: boolean } {
    const state = this.stateFor(userId);
    const changes = state.buffer.filter((change) => change.seq > cursor);
    const missed = state.nextSeq - 1 - cursor - changes.length;
    const resync = cursor >= state.nextSeq || missed > 0;
    return {
      changes: resync ? [] : changes,
      cursor: state.nextSeq - 1,
      resync,
    };
  }

  currentSeq(userId: string): number {
    return this.stateFor(userId).nextSeq - 1;
  }

  private stateFor(userId: string) {
    let state = this.users.get(userId);
    if (!state) {
      state = { nextSeq: Date.now() + 1, buffer: [], lastFingerprint: new Map() };
      this.users.set(userId, state);
    }
    return state;
  }
}
