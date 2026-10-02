import { describe, expect, it } from 'vitest';

import { buildChatItems, buildTurns, type ChatItem } from './buildChatItems';
import type { AgentMessageJson } from '@taskora/shared';

describe('buildChatItems', () => {
  it('renders user and assistant text as bubbles', () => {
    const items = buildChatItems([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hi ' },
          { type: 'text', text: 'there' },
        ],
      },
    ]);
    expect(items).toEqual([
      { kind: 'user', text: 'hello', id: 'm-0' },
      { kind: 'assistant', text: 'hi there', id: 'm-1-t' },
    ]);
  });

  it('renders user messages with block content', () => {
    const items = buildChatItems([
      { role: 'user', content: [{ type: 'text', text: 'from blocks' }] },
    ]);
    expect(items[0]).toMatchObject({ kind: 'user', text: 'from blocks' });
  });

  it('extracts thinking blocks before the assistant text', () => {
    const items = buildChatItems([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'let me think' },
          { type: 'text', text: 'answer' },
        ],
      },
    ]);
    expect(items).toEqual([
      { kind: 'user', text: 'hi', id: 'm-0' },
      { kind: 'thinking', text: 'let me think', id: 'm-1-th' },
      { kind: 'assistant', text: 'answer', id: 'm-1-t' },
    ]);
  });

  it('pairs tool calls with their results', () => {
    const items = buildChatItems([
      { role: 'user', content: 'list tasks' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking…' },
          { type: 'toolCall', id: 'c1', name: 'list_tasks', arguments: { view: 'today' } },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'c1',
        toolName: 'list_tasks',
        content: [{ type: 'text', text: '{"count":2}' }],
      },
    ]);
    expect(items).toEqual([
      { kind: 'user', text: 'list tasks', id: 'm-0' },
      { kind: 'assistant', text: 'Checking…', id: 'm-1-t' },
      {
        kind: 'tool',
        id: 'm-1-c-c1',
        toolCallId: 'c1',
        toolName: 'list_tasks',
        args: { view: 'today' },
        status: 'done',
        resultText: '{"count":2}',
        entityTitle: null,
      },
    ]);
  });

  it('marks error tool results', () => {
    const items = buildChatItems([
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'c2', name: 'delete_task', arguments: { id: 'x' } }],
      },
      {
        role: 'toolResult',
        toolCallId: 'c2',
        toolName: 'delete_task',
        content: [{ type: 'text', text: 'blocked' }],
        isError: true,
      },
    ]);
    expect(items).toEqual([
      {
        kind: 'tool',
        id: 'm-0-c-c2',
        toolCallId: 'c2',
        toolName: 'delete_task',
        args: { id: 'x' },
        status: 'error',
        resultText: 'blocked',
        entityTitle: null,
      },
    ]);
  });

  it('keeps tools without a stored result as running while live, error otherwise', () => {
    const messages: AgentMessageJson[] = [
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'c3', name: 'list_tags', arguments: {} }],
      },
    ];
    expect(buildChatItems(messages, new Set(['c3']))[0]).toMatchObject({
      status: 'running',
    });
    expect(buildChatItems(messages, new Set())[0]).toMatchObject({ status: 'error' });
  });

  it('treats a result-less tool call as running while the agent is streaming', () => {
    // SSE delivery order leaves gaps where the tool card exists in the cache
    // but neither its tool_execution_start nor its toolResult message has
    // arrived yet (and a gap between tool_execution_end and the toolResult
    // message_end). While agentActive, those must render as running, not error.
    const messages: AgentMessageJson[] = [
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'c4', name: 'list_tags', arguments: {} }],
      },
    ];
    expect(buildChatItems(messages, new Set(), true)[0]).toMatchObject({
      status: 'running',
    });
  });

  it('surfaces orphan tool results as inline errors', () => {
    const items = buildChatItems([
      {
        role: 'toolResult',
        toolCallId: 'gone',
        toolName: 'delete_task',
        content: [{ type: 'text', text: 'user declined' }],
        isError: true,
      },
    ]);
    expect(items).toEqual([{ kind: 'error', text: 'user declined', id: 'orphan-gone' }]);
  });

  it('resolves target entity titles from earlier tool results and renames', () => {
    const items = buildChatItems([
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'c1', name: 'list_tasks', arguments: {} }],
      },
      {
        role: 'toolResult',
        toolCallId: 'c1',
        content: [
          { type: 'text', text: '{"items":[{"id":"t1","title":"Old"},{"id":"t2","title":"Two"}]}' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', id: 'c2', name: 'delete_task', arguments: { id: 't2' } },
          {
            type: 'toolCall',
            id: 'c3',
            name: 'update_task',
            arguments: { id: 't1', title: 'New' },
          },
          { type: 'toolCall', id: 'c4', name: 'get_task', arguments: { id: 'unknown' } },
        ],
      },
    ]);
    expect(items.map((i) => i.kind === 'tool' && i.entityTitle)).toEqual([
      null,
      'Two',
      'New',
      null,
    ]);
  });
});

describe('buildTurns', () => {
  const tool = (
    id: string,
    toolName = 'list_tasks',
    status: 'done' | 'running' = 'done',
  ): ChatItem => ({
    kind: 'tool',
    id,
    toolCallId: id,
    toolName,
    args: {},
    status,
    resultText: null,
    entityTitle: null,
  });
  const user = (id: string): ChatItem => ({ kind: 'user', text: 'hi', id });
  const text = (id: string, value: string): ChatItem => ({ kind: 'assistant', text: value, id });
  const thinking = (id: string): ChatItem => ({ kind: 'thinking', text: 'hmm', id });

  it('splits a turn into the process and the trailing answer', () => {
    const blocks = buildTurns([
      user('u1'),
      thinking('th1'),
      text('n1', 'let me check'),
      tool('c1', 'list_tasks'),
      tool('c2', 'update_task'),
      text('a1', 'done!'),
      user('u2'),
      text('a2', 'plain reply'),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(['user', 'turn', 'user', 'turn']);
    const [, first, , second] = blocks;
    expect(first).toMatchObject({
      id: 't-u1',
      steps: [{ id: 'th1' }, { id: 'n1' }, { id: 'c1' }, { id: 'c2' }],
      answer: 'done!',
      active: false,
    });
    expect(second).toMatchObject({ steps: [], answer: 'plain reply' });
  });

  it('keeps text followed by tool calls as narration, not the answer', () => {
    const [, turn] = buildTurns([user('u1'), text('n1', 'checking'), tool('c1')]);
    expect(turn).toMatchObject({ steps: [{ id: 'n1' }, { id: 'c1' }], answer: null });
  });

  it('merges the live run into the last turn', () => {
    const live = { active: true, thinking: 'pondering', text: null };
    const [, turn] = buildTurns([user('u1'), tool('c1', 'search', 'running')], live);
    expect(turn).toMatchObject({
      active: true,
      answerStreaming: false,
      steps: [{ id: 'c1' }, { kind: 'thinking', text: 'pondering', streaming: true }],
    });

    const [, answering] = buildTurns([user('u1'), tool('c1')], {
      active: true,
      thinking: null,
      text: 'Here',
    });
    expect(answering).toMatchObject({ answer: 'Here', answerStreaming: true });
  });

  it('opens an empty active turn right after the user message', () => {
    const blocks = buildTurns([user('u1')], { active: true, thinking: null, text: '' });
    expect(blocks[1]).toMatchObject({ kind: 'turn', steps: [], answer: null, active: true });
  });
});
