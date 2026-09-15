import type { AgentMessageJson } from '@taskora/shared';

export type ChatItem =
  | { kind: 'user'; text: string; id: string }
  | { kind: 'assistant'; text: string; id: string }
  | {
      kind: 'tool';
      id: string;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      status: 'running' | 'done' | 'error';
      resultText: string | null;
    }
  | { kind: 'error'; text: string; id: string };

interface ToolCallBlock {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

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

function toolCallsOf(content: unknown): ToolCallBlock[] {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (c): c is ToolCallBlock =>
      typeof c === 'object' && c !== null && (c as { type?: string }).type === 'toolCall',
  );
}

/**
 * Fold the persisted AgentMessage transcript into renderable chat items.
 *
 * - user → user bubble
 * - assistant text blocks → assistant bubble
 * - assistant toolCall blocks → tool cards; the paired toolResult message
 *   (matched by toolCallId) decides done/error and carries the result text
 * - orphan toolResult messages (no matching call, e.g. blocked before the
 *   assistant message was persisted) render as inline error text
 */
export function buildChatItems(
  messages: AgentMessageJson[],
  runningToolCallIds: ReadonlySet<string> = new Set(),
): ChatItem[] {
  const items: ChatItem[] = [];
  const results = new Map<string, { isError: boolean; text: string }>();
  const seenToolCallIds = new Set<string>();

  for (const message of messages) {
    if (message.role === 'toolResult') {
      const toolCallId = message.toolCallId as string | undefined;
      const content = message.content as unknown;
      const text = textOf(content) || JSON.stringify(message.details ?? '');
      if (toolCallId) {
        results.set(toolCallId, { isError: Boolean(message.isError), text });
      } else {
        items.push({ kind: 'error', text, id: `err-${items.length}` });
      }
    }
  }

  for (const message of messages) {
    const id = `m-${items.length}`;
    if (message.role === 'user') {
      const text = textOf(message.content);
      if (text) items.push({ kind: 'user', text, id });
    } else if (message.role === 'assistant') {
      const content = message.content as unknown;
      const text = textOf(content);
      if (text) items.push({ kind: 'assistant', text, id: `${id}-t` });
      for (const call of toolCallsOf(content)) {
        seenToolCallIds.add(call.id);
        const result = results.get(call.id);
        const status: 'running' | 'done' | 'error' = result
          ? result.isError
            ? 'error'
            : 'done'
          : runningToolCallIds.has(call.id)
            ? 'running'
            : 'error'; // interrupted before the result was persisted
        items.push({
          kind: 'tool',
          id: `${id}-c-${call.id}`,
          toolCallId: call.id,
          toolName: call.name,
          args: call.arguments ?? {},
          status,
          resultText: result?.text ?? null,
        });
      }
    }
  }

  // A stored tool call without a stored result and not currently running is a
  // leftover from an interrupted run; surface it as an error card.
  for (const [toolCallId, result] of results) {
    if (!seenToolCallIds.has(toolCallId)) {
      items.push({
        kind: 'error',
        text: result.text || `Tool ${toolCallId}`,
        id: `orphan-${toolCallId}`,
      });
    }
  }

  return items;
}
