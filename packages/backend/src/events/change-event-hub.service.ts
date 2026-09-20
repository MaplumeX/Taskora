import { Injectable } from '@nestjs/common';

import type { ChangeEvent, EventStreamFrame } from '@taskora/shared';

/**
 * In-process hub owning each user's Event Stream state: a monotonic sequence
 * number (seeded from Date.now() so a server restart produces a detectable
 * jump) and a ring buffer of recent events for reconnect replay.
 *
 * Events are never persisted — the ring buffer is the only replay source,
 * and a gap beyond it is surfaced as a `resync` frame (client refetches).
 */
@Injectable()
export class ChangeEventHub {
  /** Ring buffer size per user. ~500 events per ADR 0005. */
  private readonly bufferSize = 500;

  private readonly users = new Map<
    string,
    { nextSeq: number; buffer: ChangeEvent[]; listeners: Set<(frame: ChangeEvent) => void> }
  >();

  /** 全局发布探针（同步推流用）：每次 publish 时回调，与 SSE 订阅者无关。 */
  private readonly taps = new Set<(userId: string, event: ChangeEvent) => void>();

  tap(listener: (userId: string, event: ChangeEvent) => void): () => void {
    this.taps.add(listener);
    return () => {
      this.taps.delete(listener);
    };
  }

  /**
   * Subscribe to live events. Returns the initial frames to write before any
   * live event, computed atomically with the registration:
   *
   * - no `since`: just `hello` with the current seq.
   * - `since` fully covered by the buffer: `hello` + the missed events.
   * - `since` beyond the buffer (or after a seq jump): `hello` + `resync`.
   */
  subscribe(
    userId: string,
    since: number | undefined,
    listener: (frame: ChangeEvent) => void,
  ): { initialFrames: EventStreamFrame[]; unsubscribe: () => void } {
    const state = this.stateFor(userId);
    const initialFrames: EventStreamFrame[] = [{ type: 'hello', seq: state.nextSeq - 1 }];

    if (since !== undefined) {
      const replay = this.replayFor(state, since);
      if (replay === null) {
        initialFrames.push({ type: 'resync' });
      } else {
        initialFrames.push(...replay.map((event) => ({ type: 'change' as const, event })));
      }
    }

    state.listeners.add(listener);
    return {
      initialFrames,
      unsubscribe: () => {
        state.listeners.delete(listener);
      },
    };
  }

  /** Assign the next seq, buffer the event, and fan out to live listeners. */
  publish(userId: string, event: Omit<ChangeEvent, 'seq'>): ChangeEvent {
    const state = this.stateFor(userId);
    const framed = { ...event, seq: state.nextSeq++ } as ChangeEvent;
    state.buffer.push(framed);
    if (state.buffer.length > this.bufferSize) {
      state.buffer.splice(0, state.buffer.length - this.bufferSize);
    }
    for (const listener of state.listeners) {
      try {
        listener(framed);
      } catch {
        // A broken SSE listener must never break a write path.
      }
    }
    for (const tap of this.taps) {
      try {
        tap(userId, framed);
      } catch {
        // 探针异常不得破坏写路径
      }
    }
    return framed;
  }

  /** Latest seq assigned for the user (seed itself when never touched). */
  currentSeq(userId: string): number {
    return this.stateFor(userId).nextSeq - 1;
  }

  /** Drop all state (tests only). */
  clear(): void {
    this.users.clear();
  }

  private stateFor(userId: string) {
    let state = this.users.get(userId);
    if (!state) {
      // Date.now() seed: after a restart the sequence jumps, so clients
      // holding pre-restart seqs are pushed into a full refetch.
      state = { nextSeq: Date.now() + 1, buffer: [], listeners: new Set() };
      this.users.set(userId, state);
    }
    return state;
  }

  /**
   * Events with seq > since, or null when the buffer cannot fully cover the
   * gap (including `since` pointing past the current seq — restart scenario).
   */
  private replayFor(
    state: { nextSeq: number; buffer: ChangeEvent[] },
    since: number,
  ): ChangeEvent[] | null {
    if (since >= state.nextSeq) {
      // Client holds a seq from a previous process (or a newer one):
      // the gap is unknowable, force a resync.
      return null;
    }
    const buffer = state.buffer;
    if (buffer.length === 0) {
      // Nothing buffered: the client missed nothing only if it is fully
      // caught up; otherwise the gap is beyond what we can replay.
      return since === state.nextSeq - 1 ? [] : null;
    }
    const first = buffer[0];
    if (since < first.seq - 1) {
      return null; // Gap starts before the oldest buffered event.
    }
    return buffer.filter((event) => event.seq > since);
  }
}
