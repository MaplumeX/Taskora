import { QueryClient } from '@tanstack/react-query';
import type { ChangeEvent, EventStreamFrame } from '@taskora/shared';

import { apiClient, refreshSession } from '@/api/client';
import { EventStreamApplier } from '@/events/event-applier';
import { getTokenStore } from '@/token-store';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Event Stream connection manager: one app-layer singleton per client
 * (frontend main window, desktop main window, Quick Add window), owned by
 * the entry point — never by a component lifecycle.
 *
 * - Connects after login, disconnects on logout (watches the auth store).
 * - Parses SSE with fetch + ReadableStream (EventSource cannot send
 *   Authorization headers), same pattern as agent-sse.ts.
 * - Reconnects with backoff, passing ?since=<lastSeq>; the server replays
 *   the gap or signals `resync`.
 * - A missed seq (client-side gap detection) or a `resync` frame triggers
 *   one full invalidateQueries — the only correctness backstop now that
 *   refetchOnWindowFocus is off.
 */

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

let connection: EventStreamConnection | null = null;
let unsubscribeAuth: (() => void) | null = null;

/** Install the singleton at the app entry point (idempotent). */
/**
 * 远端变更到达通知（ADR-0007）：SSE 的 Event Stream 作为同步协议的
 * 传输层——任何 live change 帧都提示 hub 有新变更，桌面端可据此立即
 * 拉取增量（秒级到达），而不等下一个周期同步。
 */
let remoteChangeListener: (() => void) | null = null;

/** 注册「hub 有新变更」回调（桌面端接入 engine 同步）。返回退订函数。 */
export function onRemoteChangeEvent(listener: () => void): () => void {
  remoteChangeListener = listener;
  return () => {
    if (remoteChangeListener === listener) remoteChangeListener = null;
  };
}

/**
 * 缓存手术开关（桌面端 local-first）：Engine 激活时关闭——SSE 仅作
 * 「触发 engine pull」的提示通道（ADR-0007），缓存失效由 engine.onChange
 * 驱动，避免同一事件的双重失效与 applier 的 sortOrder/createdAt 排序
 * 与副本 Position 排序两个权威打架；退回 REST 后端时恢复。
 */
let cacheSurgeryEnabled = true;

export function setEventStreamCacheSurgery(enabled: boolean): void {
  cacheSurgeryEnabled = enabled;
  // 关闭前排空队列：已入队的事件按原路径处理完，不留悬挂状态。
  if (!enabled) connection?.flushApplier();
}

export function initEventStream(queryClient: QueryClient): void {
  if (connection) return;
  connection = new EventStreamConnection(queryClient);

  unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    const loggedIn = !!state.token && !!state.user;
    const wasLoggedIn = !!previous.token && !!previous.user;
    if (loggedIn && !wasLoggedIn) {
      connection?.connect();
    } else if (!loggedIn && wasLoggedIn) {
      connection?.disconnect();
    }
  });

  // Recovery may have finished before init ran.
  const auth = useAuthStore.getState();
  if (auth.token && auth.user) {
    connection.connect();
  }
}

/** Tear down (tests). */
export function destroyEventStream(): void {
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  connection?.disconnect();
  connection = null;
}

class EventStreamConnection {
  private readonly applier: EventStreamApplier;
  private controller: AbortController | null = null;
  private lastSeq: number | undefined;
  private helloSeq: number | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(private readonly queryClient: QueryClient) {
    this.applier = new EventStreamApplier(queryClient);
  }

  connect(): void {
    if (this.controller) return;
    void this.run();
  }

  /** 排空已入队的缓存手术（Engine 接管前）。 */
  flushApplier(): void {
    this.applier.flush();
  }

  disconnect(): void {
    // A later login may reconnect; only destroyEventStream is final.
    this.controller?.abort();
    this.controller = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempt = 0;
    this.applier.flush();
  }

  private async run(): Promise<void> {
    this.controller = new AbortController();
    const controller = this.controller;
    try {
      await this.stream(controller.signal);
      // Clean server-side close: reconnect immediately-ish.
      this.scheduleReconnect(RECONNECT_BASE_MS);
    } catch (error) {
      if (controller.signal.aborted) return;
      // 401: the access token expired while offline; refresh and retry.
      if (error instanceof UnauthorizedError) {
        try {
          await refreshSession();
          this.scheduleReconnect(RECONNECT_BASE_MS);
        } catch {
          // refreshSession already cleared the store; auth watcher will
          // keep us disconnected.
        }
        return;
      }
      this.scheduleReconnect(backoffMs(this.attempt));
    }
  }

  private async stream(signal: AbortSignal): Promise<void> {
    const base = (apiClient.defaults.baseURL ?? '').replace(/\/+$/, '');
    const since = this.lastSeq !== undefined ? `?since=${this.lastSeq}` : '';
    const token = getTokenStore().get() ?? useAuthStore.getState().token;

    const response = await fetch(`${base}/events${since}`, {
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      signal,
    });
    if (response.status === 401) {
      throw new UnauthorizedError();
    }
    if (!response.ok || !response.body) {
      throw new Error(`Event stream failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let separator: { end: number; next: number } | undefined;
      while ((separator = findFrameSeparator(buffer)) !== undefined) {
        const frame = buffer.slice(0, separator.end);
        buffer = buffer.slice(separator.next);
        this.handleFrame(parseFrame(frame));
      }
    }
  }

  private handleFrame(frame: EventStreamFrame | null): void {
    if (!frame) return;
    switch (frame.type) {
      case 'hello':
        this.helloSeq = frame.seq;
        // Fresh connection: adopt the server's current seq. On reconnect
        // (since sent) keep ours — replayed events pick up from it, and a
        // `resync` frame resets it below.
        if (this.lastSeq === undefined) {
          this.lastSeq = frame.seq;
        }
        this.attempt = 0;
        break;
      case 'change': {
        const event = frame.event;
        if (this.lastSeq !== undefined && event.seq !== this.lastSeq + 1) {
          // Gap: something was missed mid-stream. Full refetch, then
          // continue from this event.
          void this.queryClient.invalidateQueries();
        }
        this.lastSeq = event.seq;
        if (cacheSurgeryEnabled) {
          this.applier.push(event as ChangeEvent);
        }
        // 同步传输层（ADR-0007）：live change 到达 → 通知 engine 立即 pull。
        remoteChangeListener?.();
        break;
      }
      case 'resync':
        void this.queryClient.invalidateQueries();
        // The server cannot replay from our seq; adopt the seq it just
        // greeted us with so the next live event isn't misread as a gap.
        // hello always precedes resync on the same connection.
        if (this.helloSeq !== undefined) {
          this.lastSeq = this.helloSeq;
        } else {
          this.lastSeq = undefined;
        }
        break;
    }
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.controller = null;
      this.connect();
    }, delayMs);
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super('event stream unauthorized');
  }
}

function backoffMs(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
}

function findFrameSeparator(buffer: string): { end: number; next: number } | undefined {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1 && crlf === -1) return undefined;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) {
    return { end: crlf, next: crlf + 4 };
  }
  return { end: lf, next: lf + 2 };
}

function parseFrame(frame: string): EventStreamFrame | null {
  // Only JSON payloads on `data:` lines; comments and event names ignored —
  // every frame carries its discriminated `type` inside the payload.
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      try {
        return JSON.parse(line.slice(5).trim()) as EventStreamFrame;
      } catch {
        return null;
      }
    }
  }
  return null;
}
