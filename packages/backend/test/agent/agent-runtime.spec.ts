import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import type { AssistantMessage, Context, Model, SimpleStreamOptions } from '@earendil-works/pi-ai';
import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

import { AgentRuntimeService } from '../../src/agent/runtime/agent-runtime.service';
import { AgentEventHub } from '../../src/agent/runtime/agent-event-hub';
import { AgentApprovalService } from '../../src/agent/approvals/approval.service';
import { ConversationsService } from '../../src/agent/conversations.service';
import type { AgentSseEvent } from '@taskora/shared';

/**
 * Integration-flavoured runtime test with a scripted streamFn: verifies the
 * real pi-agent-core Agent wiring — persistence, SSE bridging, state rebuild
 * and the destructive-approval gate — without any network.
 */

const USER = 'user-1';
const CONV = 'conv-1';

function makeAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello!' }],
    api: 'openai-completions',
    provider: 'taskora-byok',
    model: 'test-model',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    ...overrides,
  } as AssistantMessage;
}

/** Build a stream that emits one scripted assistant message. */
function scriptedStream(message: AssistantMessage) {
  return () => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      stream.push({ type: 'start', partial: message });
      let index = 0;
      for (const block of message.content) {
        if (block.type === 'text') {
          stream.push({ type: 'text_start', contentIndex: index, partial: message });
          stream.push({
            type: 'text_delta',
            contentIndex: index,
            delta: block.text,
            partial: message,
          });
          stream.push({
            type: 'text_end',
            contentIndex: index,
            content: block.text,
            partial: message,
          });
        } else if (block.type === 'toolCall') {
          stream.push({ type: 'toolcall_start', contentIndex: index, partial: message });
          stream.push({
            type: 'toolcall_end',
            contentIndex: index,
            toolCall: block,
            partial: message,
          });
        }
        index += 1;
      }
      stream.push({ type: 'done', reason: message.stopReason as 'stop', message });
      stream.end(message);
    });
    return stream;
  };
}

interface Harness {
  runtime: AgentRuntimeService;
  events: AgentSseEvent[];
  sse: (event: AgentSseEvent) => void;
  stored: { messages: AgentMessage[]; title: string | null };
  approvalDecision: Promise<'approve' | 'reject' | 'expire'> | null;
  resolveApproval: (d: 'approve' | 'reject') => void;
  tools: AgentTool<never>[];
}

function createHarness(options: { storedMessages?: AgentMessage[]; hasTitle?: boolean }): Harness {
  const hub = new AgentEventHub();
  const events: AgentSseEvent[] = [];
  const sse = (event: AgentSseEvent) => events.push(event);
  hub.subscribe(CONV, sse);

  const stored = {
    messages: [...(options.storedMessages ?? [])],
    title: options.hasTitle ? 'Existing' : null,
  };

  const conversations = {
    get: vi.fn(async () => ({
      id: CONV,
      title: stored.title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    loadMessages: vi.fn(async () => stored.messages.map((m) => ({ ...m }))),
    appendMessage: vi.fn(async (_conv: string, message: AgentMessage, seq: number) => {
      stored.messages[seq] = message;
      return {
        id: `m-${seq}`,
        seq,
        message: message as never,
        createdAt: new Date().toISOString(),
      };
    }),
    touch: vi.fn(async () => {}),
    setTitleIfUnset: vi.fn(async (_id: string, title: string) => {
      if (stored.title === null) stored.title = title;
    }),
  };

  const agentConfig = {
    resolveRuntimeConfig: vi.fn(async () => ({
      baseUrl: 'http://llm.test/v1',
      apiKey: 'sk-test',
      modelId: 'test-model',
    })),
  };

  // One destructive + one safe tool so the approval gate is exercised.
  const executed: string[] = [];
  const tools: AgentTool<never>[] = [
    {
      name: 'safe_tool',
      label: 'Safe',
      description: 'A safe tool',
      parameters: Type.Object({}),
      execute: async () => {
        executed.push('safe_tool');
        return { content: [{ type: 'text', text: 'ok' }], details: { ok: true } };
      },
    },
    {
      name: 'dangerous_tool',
      label: 'Dangerous',
      description: 'A destructive tool',
      destructive: true,
      parameters: Type.Object({ target: Type.String() }),
      execute: async (_id, params) => {
        executed.push(`dangerous_tool:${params.target}`);
        return { content: [{ type: 'text', text: 'deleted' }], details: { deleted: true } };
      },
    } as AgentTool<never>,
  ];

  const toolsService = { build: vi.fn(() => tools) };

  let approvalDecision: Harness['approvalDecision'] = null;
  let decisionResolve!: (d: 'approve' | 'reject') => void;
  const approvals = {
    requestApproval: vi.fn(async () => {
      approvalDecision = new Promise((resolve) => {
        decisionResolve = resolve;
      });
      return approvalDecision;
    }),
    rejectAllPending: vi.fn(async () => {}),
  };

  const prisma = {
    conversation: {
      findUnique: vi.fn(async () => ({ title: stored.title })),
    },
  };

  const runtime = new AgentRuntimeService(
    prisma as never,
    agentConfig as never,
    toolsService as never,
    approvals as unknown as AgentApprovalService,
    conversations as unknown as ConversationsService,
    hub,
  );

  return {
    runtime,
    events,
    sse,
    stored,
    get approvalDecision() {
      return approvalDecision;
    },
    resolveApproval: (d) => decisionResolve(d),
    tools,
    ...({ executed } as { executed: string[] }),
  } as Harness & { executed: string[] };
}

// Patch the loader so the scripted streamFn replaces the network call.
vi.mock('../../src/agent/runtime/pi-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/agent/runtime/pi-loader')>();
  let fakeStream:
    | ((
        model: Model<'openai-completions'>,
        context: Context,
        options?: SimpleStreamOptions,
      ) => ReturnType<typeof createAssistantMessageEventStream>)
    | null = null;
  return {
    ...actual,
    setFakeStream(fn: typeof fakeStream) {
      fakeStream = fn;
    },
    loadCompletionsStreamFn: async () => {
      if (fakeStream) return fakeStream as never;
      throw new Error('no fake stream configured');
    },
  };
});

import { setFakeStream } from '../../src/agent/runtime/pi-loader';

describe('AgentRuntimeService', () => {
  let harness: ReturnType<typeof createHarness> & { executed: string[] };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams a plain reply and persists the transcript', async () => {
    const message = makeAssistantMessage();
    setFakeStream(scriptedStream(message) as never);
    harness = createHarness({});

    await harness.runtime.sendMessage(USER, CONV, 'Hi there');
    await vi.waitFor(() => {
      expect(harness.events.some((e) => e.type === 'agent_end')).toBe(true);
    });

    // Persisted: user prompt + assistant reply, in order.
    expect(harness.stored.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const userMessage = harness.stored.messages[0] as {
      role: 'user';
      content: { type: string; text: string }[];
    };
    expect(userMessage.content[0].text).toBe('Hi there');

    // SSE saw the streaming lifecycle.
    const types = harness.events.map((e) => e.type);
    expect(types).toContain('agent_start');
    expect(types).toContain('message_update');
    expect(types).toContain('message_end');
    expect(types).toContain('agent_end');

    // Fallback title (stream fn is only used for chat here — title gen fails
    // through the fake stream and falls back).
    await vi.waitFor(() => {
      expect(harness.stored.title).toBeTruthy();
    });
  });

  it('rebuilds agent state from persisted messages', async () => {
    const history: AgentMessage[] = [
      { role: 'user', content: 'previous question', timestamp: 1 },
      makeAssistantMessage(),
    ];
    setFakeStream(
      scriptedStream(makeAssistantMessage({ content: [{ type: 'text', text: 'again' }] })) as never,
    );
    harness = createHarness({ storedMessages: history });

    await harness.runtime.sendMessage(USER, CONV, 'continue');
    await vi.waitFor(() => {
      expect(harness.stored.messages.length).toBe(4);
    });
    // seq continues after the rebuilt history, nothing duplicated.
    expect(harness.stored.messages[2].role).toBe('user');
    expect(harness.stored.messages[3].role).toBe('assistant');
  });

  it('blocks destructive tools until approved, then runs the same call', async () => {
    const message = makeAssistantMessage({
      content: [
        {
          type: 'toolCall',
          id: 'call-9',
          name: 'dangerous_tool',
          arguments: { target: 'area-1' },
        },
      ],
      stopReason: 'toolUse',
    });
    setFakeStream(scriptedStream(message) as never);
    harness = createHarness({});

    await harness.runtime.sendMessage(USER, CONV, 'delete my area');
    // First turn: tool call intercepted, waiting for approval.
    await vi.waitFor(() => {
      expect(harness.approvalDecision).not.toBeNull();
    });
    expect(harness.executed).toEqual([]);

    // After approval, the tool runs and the loop continues (stream replays a
    // final assistant message for the second turn).
    const secondReply = makeAssistantMessage({ content: [{ type: 'text', text: 'Done!' }] });
    setFakeStream(scriptedStream(secondReply) as never);
    harness.resolveApproval('approve');
    await vi.waitFor(() => {
      expect(harness.executed).toEqual(['dangerous_tool:area-1']);
    });
    await vi.waitFor(() => {
      expect(harness.events.some((e) => e.type === 'tool_execution_end' && !e.isError)).toBe(true);
    });
  });

  it('rejecting leaves data untouched and surfaces an error tool result', async () => {
    const message = makeAssistantMessage({
      content: [
        {
          type: 'toolCall',
          id: 'call-8',
          name: 'dangerous_tool',
          arguments: { target: 'area-2' },
        },
      ],
      stopReason: 'toolUse',
    });
    setFakeStream(scriptedStream(message) as never);
    harness = createHarness({});

    await harness.runtime.sendMessage(USER, CONV, 'delete it');
    await vi.waitFor(() => {
      expect(harness.approvalDecision).not.toBeNull();
    });

    const apology = makeAssistantMessage({ content: [{ type: 'text', text: 'Sorry!' }] });
    setFakeStream(scriptedStream(apology) as never);
    harness.resolveApproval('reject');
    await vi.waitFor(() => {
      expect(harness.executed).toEqual([]);
      expect(harness.events.some((e) => e.type === 'tool_execution_end' && e.isError)).toBe(true);
    });
  });
});
