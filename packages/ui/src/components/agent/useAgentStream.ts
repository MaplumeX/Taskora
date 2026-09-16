import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { agentKeys, invalidateDomainData, subscribeAgentEvents } from '@taskora/api';
import type { AgentMessageJson, ConversationMessageDto } from '@taskora/shared';
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

/**
 * Subscribes to the conversation's SSE stream and reconciles durable state
 * into the TanStack Query caches (messages / approvals / conversations).
 * Live-only state (deltas, running tools) is local.
 */
export function useAgentStream(conversationId: string | null): AgentStreamState {
  const queryClient = useQueryClient();
  const [streamingThinking, setStreamingThinking] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [runningToolCallIds, setRunningToolCallIds] = useState<ReadonlySet<string>>(new Set());
  const [agentActive, setAgentActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const appendMessage = useCallback(
    (message: AgentMessageJson, dedupeUserText = false) => {
      const key = agentKeys.messages(conversationId!);
      queryClient.setQueryData<ConversationMessageDto[]>(key, (current) => {
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
      });
    },
    [conversationId, queryClient],
  );

  useEffect(() => {
    if (!conversationId) return;
    setConnected(false);
    setStreamingThinking(null);
    setStreamingText(null);
    setRunningToolCallIds(new Set());
    setAgentActive(false);

    const dispose = subscribeAgentEvents(
      conversationId,
      (event) => {
        switch (event.type) {
          case 'message_start':
            if (event.message.role === 'assistant') {
              setStreamingThinking(null);
              setStreamingText('');
            }
            break;
          case 'message_update':
            if (event.message.role === 'assistant') {
              // Thinking deltas arrive before text deltas; keep both alive
              // independently so a finished thinking block stays visible while
              // the answer streams in below it.
              const thinking = thinkingOf(event.message.content);
              if (thinking) setStreamingThinking(thinking);
              const text = textOf(event.message.content);
              if (text) setStreamingText(text);
            }
            break;
          case 'message_end':
            appendMessage(event.message, event.message.role === 'user');
            if (event.message.role === 'assistant') {
              setStreamingThinking(null);
              setStreamingText(null);
            }
            break;
          case 'tool_execution_start':
            setRunningToolCallIds((prev) => new Set(prev).add(event.toolCallId));
            break;
          case 'tool_execution_end':
            setRunningToolCallIds((prev) => {
              const next = new Set(prev);
              next.delete(event.toolCallId);
              return next;
            });
            break;
          case 'agent_start':
            setAgentActive(true);
            break;
          case 'agent_end':
            setAgentActive(false);
            setStreamingThinking(null);
            setStreamingText(null);
            setRunningToolCallIds(new Set());
            // Reconcile with the durable store (seq, ordering, title).
            void queryClient.invalidateQueries({ queryKey: agentKeys.messages(conversationId) });
            void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
            break;
          case 'data_changed':
            // A mutating tool wrote through the backend services; refresh
            // the domain caches (sidebar, buckets, detail pages) live.
            invalidateDomainData(queryClient);
            break;
          case 'approval_request':
          case 'approval_resolved':
            void queryClient.invalidateQueries({
              queryKey: agentKeys.approvals(conversationId),
            });
            break;
          case 'conversation_updated':
            void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
            break;
          case 'error':
            setLastError(event.message);
            break;
        }
      },
      () => setConnected(false),
    );
    setConnected(true);

    return dispose;
  }, [conversationId, appendMessage, queryClient]);

  return {
    streamingThinking,
    streamingText,
    runningToolCallIds,
    agentActive,
    connected,
    lastError,
  };
}
