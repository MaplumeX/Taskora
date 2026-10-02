import type { AgentMessageJson } from '@taskora/shared';

export type ChatItem =
  | { kind: 'user'; text: string; id: string }
  | { kind: 'assistant'; text: string; id: string }
  | { kind: 'thinking'; text: string; id: string }
  | {
      kind: 'tool';
      id: string;
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      status: 'running' | 'done' | 'error';
      resultText: string | null;
      /** Title of the entity the call targets, resolved from the transcript. */
      entityTitle: string | null;
    }
  | { kind: 'error'; text: string; id: string };

export type ToolChatItem = Extract<ChatItem, { kind: 'tool' }>;

/** One entry of a turn's process timeline. */
export type ProcessStep =
  | (Extract<ChatItem, { kind: 'thinking' }> & { streaming?: boolean })
  | Extract<ChatItem, { kind: 'assistant' }>
  | ToolChatItem;

/**
 * Everything the agent produced in reply to one user message, split into the
 * process (thinking, narration, every tool call — in order) and the final
 * answer.
 */
export interface ChatTurn {
  kind: 'turn';
  id: string;
  steps: ProcessStep[];
  answer: string | null;
  /** The answer is still streaming in. */
  answerStreaming: boolean;
  /** The agent is still working on this turn. */
  active: boolean;
}

export type ChatBlock =
  Extract<ChatItem, { kind: 'user' }> | Extract<ChatItem, { kind: 'error' }> | ChatTurn;

/** Live (not yet persisted) state of the current run. */
export interface LiveRun {
  active: boolean;
  thinking: string | null;
  text: string | null;
}

/**
 * Read-only tools only look things up; everything else changes the user's
 * data and counts as a change. Mirrors the backend's isReadOnlyToolName.
 */
export function isWriteTool(toolName: string): boolean {
  return !/^(list_|get_|search)/.test(toolName);
}

interface ToolCallBlock {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Concatenate text blocks (or a plain string) of a message content payload. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: string; text?: string } => c?.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
  }
  return '';
}

/** Concatenate thinking blocks (or nothing) of a message content payload. */
export function thinkingOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (c): c is { type: string; thinking?: string } =>
        c?.type === 'thinking' && typeof c.thinking === 'string',
    )
    .map((c) => c.thinking ?? '')
    .join('');
}

/** Arg keys that point at the entity a tool call acts on, in priority order. */
const TARGET_ID_KEYS = ['id', 'taskId', 'projectId', 'areaId'];

/**
 * id → title for every entity mentioned in tool results (list/get/create
 * payloads carry `{ id, title }` objects at any depth) and in call args that
 * rename an entity. Later mentions win, so renames show the newest title.
 */
function collectEntityTitles(messages: AgentMessageJson[]): Map<string, string> {
  const titles = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.id === 'string' && typeof obj.title === 'string' && obj.title) {
        titles.set(obj.id, obj.title);
      }
      Object.values(obj).forEach(visit);
    }
  };
  for (const message of messages) {
    if (message.role === 'toolResult') {
      const text = textOf(message.content as unknown);
      try {
        visit(JSON.parse(text));
      } catch {
        // non-JSON result text (plain error message) — nothing to collect
      }
    } else if (message.role === 'assistant') {
      for (const call of toolCallsOf(message.content as unknown)) visit(call.arguments);
    }
  }
  return titles;
}

function entityTitleOf(args: Record<string, unknown>, titles: Map<string, string>): string | null {
  for (const key of TARGET_ID_KEYS) {
    const id = args[key];
    if (typeof id === 'string' && titles.has(id)) return titles.get(id)!;
  }
  return null;
}

function buildTurn(entries: ProcessStep[], id: string, live: LiveRun | null): ChatTurn | null {
  const steps = [...entries];
  if (live?.thinking) {
    steps.push({
      kind: 'thinking',
      text: live.thinking,
      id: `${id}-live-th`,
      streaming: !live.text,
    });
  }
  let answer: string | null = null;
  let answerStreaming = false;
  if (live?.text) {
    answer = live.text;
    answerStreaming = true;
  } else if (steps.at(-1)?.kind === 'assistant') {
    // Text with nothing after it is the reply; text followed by more steps
    // was narration ("let me check…") and stays in the process.
    answer = (steps.pop() as Extract<ProcessStep, { kind: 'assistant' }>).text;
  }
  const active = live?.active ?? false;
  if (steps.length === 0 && answer === null && !active) return null;
  return {
    kind: 'turn',
    id,
    steps,
    answer,
    answerStreaming,
    active,
  };
}

/**
 * Group chat items into user messages and agent turns. The live run (if any)
 * belongs to the last turn: its streaming thinking joins the process, its
 * streaming text is the answer-in-progress.
 */
export function buildTurns(items: ChatItem[], live: LiveRun | null = null): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let entries: ProcessStep[] = [];
  let turnId = 't-start';
  const flush = (isLast: boolean) => {
    const turn = buildTurn(entries, turnId, isLast ? live : null);
    if (turn) blocks.push(turn);
    entries = [];
  };
  for (const item of items) {
    if (item.kind === 'user' || item.kind === 'error') {
      flush(false);
      blocks.push(item);
      turnId = `t-${item.id}`;
    } else {
      entries.push(item);
    }
  }
  flush(true);
  return blocks;
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
 * - `agentActive` keeps not-yet-resulted tool cards in the running state:
 *   SSE delivery order (message_end → tool_execution_start → … →
 *   tool_execution_end → toolResult message_end) leaves gaps where the call
 *   has neither a result nor a running marker; those are in-flight, not
 *   failed. Only a run that already ended without persisting a result is an
 *   interrupted run and renders as error.
 */
export function buildChatItems(
  messages: AgentMessageJson[],
  runningToolCallIds: ReadonlySet<string> = new Set(),
  agentActive = false,
): ChatItem[] {
  const items: ChatItem[] = [];
  const results = new Map<string, { isError: boolean; text: string }>();
  const seenToolCallIds = new Set<string>();
  const titles = collectEntityTitles(messages);

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
      const thinking = thinkingOf(content);
      if (thinking) items.push({ kind: 'thinking', text: thinking, id: `${id}-th` });
      const text = textOf(content);
      if (text) items.push({ kind: 'assistant', text, id: `${id}-t` });
      for (const call of toolCallsOf(content)) {
        seenToolCallIds.add(call.id);
        const result = results.get(call.id);
        const args = call.arguments ?? {};
        const status: 'running' | 'done' | 'error' = result
          ? result.isError
            ? 'error'
            : 'done'
          : runningToolCallIds.has(call.id) || agentActive
            ? 'running'
            : 'error'; // the run already ended without persisting a result
        items.push({
          kind: 'tool',
          id: `${id}-c-${call.id}`,
          toolCallId: call.id,
          toolName: call.name,
          args,
          status,
          resultText: result?.text ?? null,
          entityTitle: entityTitleOf(args, titles),
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
