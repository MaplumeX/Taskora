import { describe, expect, it } from 'vitest';

import { buildChatItems } from './buildChatItems';
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
});
