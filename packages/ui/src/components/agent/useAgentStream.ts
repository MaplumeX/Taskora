import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { agentKeys, invalidateDomainData, subscribeAgentEvents } from '@taskora/api';
import type { AgentMessageJson, AgentSseEvent, ConversationMessageDto } from '@taskora/shared';
import { textOf, thinkingOf } from './buildChatItems';

export interface AgentStreamState {
  /** Partial assistant thinking of the current run (reasoning models). */
  streamingThinking: string | null;
  /** Partial assistant text of the current run (typing effect). */
  streamingText: string | null;
  /** toolCallIds currently executing. */
  runningToolCallIds: ReadonlySet<string>;
  /** True between agent_start and agent_end. */
  agentActive: boolean;
  /** False while the SSE connection is down. */
  connected: boolean;
  lastError: string | null;
}

const IDLE: AgentStreamState = {
  streamingThinking: null,
  streamingText: null,
  runningToolCallIds: new Set(),
  agentActive: false,
  connected: false,
  lastError: null,
};

/**
 * How long a stream outlives its last consumer. Switching between the panel
 * and the full-screen view unmounts one chat view and mounts the other; the
 * grace period lets the new one pick up the same subscription and live state
 * instead of reconnecting mid-run (the SSE endpoint does not replay deltas).
 */
export const STREAM_RELEASE_DELAY_MS = 2000;

interface StreamEntry {
  state: AgentStreamState;
  listeners: Set<() => void>;
  dispose: () => void;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

/** One SSE subscription per conversation, shared by every mounted chat view. */
const streams = new Map<string, StreamEntry>();

function appendMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: AgentMessageJson,
  dedupeUserText = false,
) {
  queryClient.setQueryData<ConversationMessageDto[]>(
    agentKeys.messages(conversationId),
    (current) => {
      const list = current ?? [];
      if (
        dedupeUserText &&
        message.role === 'user' &&
        textOf((list[list.length - 1]?.message as AgentMessageJson | undefined)?.content) ===
          textOf(message.content)
      ) {
        return list;
      }
      return [
        ...list,
        {
          id: `live-${list.length}`,
          seq: list.length,
          message,
          createdAt: new Date().toISOString(),
        },
      ];
    },
  );
}

/**
 * Durable state goes to the TanStack Query caches (messages / approvals /
 * conversations); live-only state (deltas, running tools) is returned as the
 * patch for the stream entry.
 */
function reduceEvent(
  event: AgentSseEvent,
  state: AgentStreamState,
  conversationId: string,
  queryClient: QueryClient,
): Partial<AgentStreamState> | null {
  switch (event.type) {
    case 'message_start':
      return event.message.role === 'assistant'
        ? { streamingThinking: null, streamingText: '' }
        : null;
    case 'message_update': {
      if (event.message.role !== 'assistant') return null;
      // Thinking deltas arrive before text deltas; keep both alive
      // independently so a finished thinking block stays visible while
      // the answer streams in below it.
      const patch: Partial<AgentStreamState> = {};
      const thinking = thinkingOf(event.message.content);
      if (thinking) patch.streamingThinking = thinking;
      const text = textOf(event.message.content);
      if (text) patch.streamingText = text;
      return patch;
    }
    case 'message_end':
      appendMessage(queryClient, conversationId, event.message, event.message.role === 'user');
      return event.message.role === 'assistant'
        ? { streamingThinking: null, streamingText: null }
        : null;
    case 'tool_execution_start':
      return { runningToolCallIds: new Set(state.runningToolCallIds).add(event.toolCallId) };
    case 'tool_execution_end': {
      const next = new Set(state.runningToolCallIds);
      next.delete(event.toolCallId);
      return { runningToolCallIds: next };
    }
    case 'agent_start':
      return { agentActive: true };
    case 'agent_end':
      // Reconcile with the durable store (seq, ordering, title).
      void queryClient.invalidateQueries({ queryKey: agentKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
      return {
        agentActive: false,
        streamingThinking: null,
        streamingText: null,
        runningToolCallIds: new Set(),
      };
    case 'data_changed':
      // A mutating tool wrote through the backend services; refresh
      // the domain caches (sidebar, buckets, detail pages) live.
      invalidateDomainData(queryClient);
      return null;
    case 'approval_request':
    case 'approval_resolved':
      void queryClient.invalidateQueries({ queryKey: agentKeys.approvals(conversationId) });
      return null;
    case 'conversation_updated':
      void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
      return null;
    case 'error':
      return { lastError: event.message };
  }
  return null;
}

function acquireStream(conversationId: string, queryClient: QueryClient): StreamEntry {
  const existing = streams.get(conversationId);
  if (existing) {
    if (existing.releaseTimer) clearTimeout(existing.releaseTimer);
    existing.releaseTimer = null;
    return existing;
  }

  const entry: StreamEntry = {
    state: IDLE,
    listeners: new Set(),
    dispose: () => undefined,
    releaseTimer: null,
  };
  const update = (patch: Partial<AgentStreamState> | null) => {
    if (!patch) return;
    entry.state = { ...entry.state, ...patch };
    entry.listeners.forEach((listener) => listener());
  };
  streams.set(conversationId, entry);
  entry.dispose = subscribeAgentEvents(
    conversationId,
    (event) => update(reduceEvent(event, entry.state, conversationId, queryClient)),
    () => update({ connected: false }),
  );
  entry.state = { ...entry.state, connected: true };
  return entry;
}

function releaseStream(conversationId: string, entry: StreamEntry) {
  if (entry.listeners.size > 0 || entry.releaseTimer) return;
  entry.releaseTimer = setTimeout(() => {
    entry.releaseTimer = null;
    if (entry.listeners.size > 0 || streams.get(conversationId) !== entry) return;
    entry.dispose();
    streams.delete(conversationId);
  }, STREAM_RELEASE_DELAY_MS);
}

/** Test-only: drop every stream immediately (module state outlives renders). */
export function resetAgentStreams() {
  for (const entry of streams.values()) {
    if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
    entry.dispose();
  }
  streams.clear();
}

/**
 * Live state of the conversation's SSE stream. Every chat view of the same
 * conversation (panel and full screen) shares one subscription and one
 * state, so switching views mid-run keeps the typing effect and running
 * tools intact.
 */
export function useAgentStream(conversationId: string | null): AgentStreamState {
  const queryClient = useQueryClient();

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!conversationId) return () => undefined;
      const entry = acquireStream(conversationId, queryClient);
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
        releaseStream(conversationId, entry);
      };
    },
    [conversationId, queryClient],
  );

  const getSnapshot = useCallback(
    () => (conversationId ? streams.get(conversationId)?.state : undefined) ?? IDLE,
    [conversationId],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
