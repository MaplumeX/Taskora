import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { agentKeys, subscribeAgentEvents } from '@taskora/api';
import type { AgentMessageJson, ConversationMessageDto } from '@taskora/shared';

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text?: string } => c?.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
  }
  return '';
}

export interface AgentStreamState {
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
    setStreamingText(null);
    setRunningToolCallIds(new Set());
    setAgentActive(false);

    const dispose = subscribeAgentEvents(
      conversationId,
      (event) => {
        switch (event.type) {
          case 'message_start':
            if (event.message.role === 'assistant') setStreamingText('');
            break;
          case 'message_update':
            if (event.message.role === 'assistant') {
              setStreamingText(textOf(event.message.content));
            }
            break;
          case 'message_end':
            appendMessage(event.message, event.message.role === 'user');
            if (event.message.role === 'assistant') setStreamingText(null);
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
            setStreamingText(null);
            setRunningToolCallIds(new Set());
            // Reconcile with the durable store (seq, ordering, title).
            void queryClient.invalidateQueries({ queryKey: agentKeys.messages(conversationId) });
            void queryClient.invalidateQueries({ queryKey: agentKeys.conversations });
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

  // Keep track of the latest connection attempt to avoid stale setState
  // after switching conversations.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { streamingText, runningToolCallIds, agentActive, connected, lastError };
}
