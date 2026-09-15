import { Injectable } from '@nestjs/common';

import type { AgentSseEvent } from '@taskora/shared';

/**
 * In-process pub/sub bridging agent runtime events to SSE connections.
 *
 * One set of listeners per conversation. The hub never stores events: after a
 * reconnect the client refetches messages from the REST endpoint, which is the
 * durable source of truth.
 */
@Injectable()
export class AgentEventHub {
  private listeners = new Map<string, Set<(event: AgentSseEvent) => void>>();

  subscribe(conversationId: string, listener: (event: AgentSseEvent) => void): () => void {
    let set = this.listeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.listeners.set(conversationId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(conversationId);
    };
  }

  emit(conversationId: string, event: AgentSseEvent): void {
    const set = this.listeners.get(conversationId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // A broken SSE listener must never break the agent run.
      }
    }
  }

  listenerCount(conversationId: string): number {
    return this.listeners.get(conversationId)?.size ?? 0;
  }
}
