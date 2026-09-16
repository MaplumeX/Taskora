import { BadRequestException, Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import type { Agent, AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';

import { PrismaService } from '../../prisma/prisma.service';
import type { AgentSseEvent, AgentMessageJson } from '@taskora/shared';
import { AgentConfigService } from '../byok/agent-config.service';
import { AgentToolsService, isReadOnlyToolName } from '../tools/agent-tools';
import type { TaskoraAgentTool } from '../tools/taskora-tool';
import { AgentApprovalService } from '../approvals/approval.service';
import { ConversationsService } from '../conversations.service';
import { AgentEventHub } from './agent-event-hub';
import {
  buildByokModel,
  fallbackTitle,
  renderSystemPrompt,
  resolveDevConfig,
  TITLE_SYSTEM_PROMPT,
} from './agent-model';
import { loadCompletionsStreamFn, loadPiAgentModule } from './pi-loader';

interface RuntimeEntry {
  agent: Agent;
  userId: string;
  conversationId: string;
  /** Decrypted BYOK key, needed for the one-shot title LLM call. */
  apiKey: string;
  toolMap: Map<string, TaskoraAgentTool>;
  /** Next ConversationMessage.seq to persist. */
  nextSeq: number;
  /** Serialized prompt queue: V1 runs user messages strictly one after another. */
  queue: Promise<void>;
}

/**
 * Agent runtime (issue 01 + 05): an in-memory pool of pi-agent-core `Agent`
 * instances, one per conversation, rebuilt from persisted messages so the
 * conversation continues across server restarts.
 */
@Injectable()
export class AgentRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentRuntimeService.name);
  private readonly entries = new Map<string, RuntimeEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentConfig: AgentConfigService,
    private readonly toolsService: AgentToolsService,
    private readonly approvals: AgentApprovalService,
    private readonly conversations: ConversationsService,
    private readonly hub: AgentEventHub,
  ) {}

  /**
   * Queue a user message on the conversation's agent. Resolves once the
   * message is queued; the run itself streams over SSE. Errors from the run
   * are emitted as SSE `error` events and do not reject the queue chain.
   */
  async sendMessage(userId: string, conversationId: string, content: string): Promise<void> {
    const entry = await this.getOrCreateEntry(userId, conversationId);
    entry.queue = entry.queue
      .then(() => entry.agent.prompt(content))
      .catch((error: unknown) => {
        this.logger.error(`Agent run failed: ${(error as Error).message}`);
        this.hub.emit(conversationId, {
          type: 'error',
          message: (error as Error).message ?? 'Agent run failed',
        });
      });
  }

  /** True while the conversation's agent is streaming (or waiting on approval). */
  async isActive(userId: string, conversationId: string): Promise<boolean> {
    const entry = this.entries.get(conversationId);
    return entry?.userId === userId ? entry.agent.state.isStreaming : false;
  }

  /** Drop every runtime entry of a user so fresh BYOK config takes effect. */
  resetForUser(userId: string): void {
    for (const [conversationId, entry] of this.entries) {
      if (entry.userId !== userId) continue;
      try {
        entry.agent.abort();
      } catch {
        // aborting an idle agent is a no-op that may throw; ignore.
      }
      this.entries.delete(conversationId);
      void this.approvals.rejectAllPending(conversationId).catch(() => undefined);
    }
  }

  /** Tear down the runtime for a conversation (delete/abandon). */
  async destroyConversation(userId: string, conversationId: string): Promise<void> {
    const entry = this.entries.get(conversationId);
    if (entry && entry.userId === userId) {
      try {
        entry.agent.abort();
      } catch {
        // aborting an idle agent is a no-op that may throw; ignore.
      }
      this.entries.delete(conversationId);
    }
    await this.approvals.rejectAllPending(conversationId);
  }

  /** Reject pending approvals and drop entries on shutdown. */
  async onModuleDestroy(): Promise<void> {
    for (const [conversationId, entry] of this.entries) {
      try {
        entry.agent.abort();
      } catch {
        // ignore
      }
      this.entries.delete(conversationId);
      await this.approvals.rejectAllPending(conversationId).catch(() => undefined);
    }
  }

  private findOwnedEntry(userId: string, conversationId: string): RuntimeEntry | undefined {
    const entry = this.entries.get(conversationId);
    return entry && entry.userId === userId ? entry : undefined;
  }

  private async getOrCreateEntry(userId: string, conversationId: string): Promise<RuntimeEntry> {
    const existing = await this.findOwnedEntry(userId, conversationId);
    if (existing) return existing;

    // Ownership check: throws NotFound when the conversation is not this user's.
    await this.conversations.get(userId, conversationId);

    const config = (await this.agentConfig.resolveRuntimeConfig(userId)) ?? resolveDevConfig();
    if (!config) {
      throw new BadRequestException(
        'Assistant is not configured yet. Add your provider settings in Settings → Assistant.',
      );
    }

    const [piAgent, streamFn] = await Promise.all([loadPiAgentModule(), loadCompletionsStreamFn()]);

    const model = buildByokModel(config);
    const tools = this.toolsService.build(userId);
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

    const messages = await this.conversations.loadMessages(conversationId);
    const nextSeq = messages.length;

    const agent = new piAgent.Agent({
      initialState: {
        systemPrompt: renderSystemPrompt(),
        model,
        // Reasoning models stream a thinking block that the UI shows in a
        // collapsible section; off keeps requests free of effort parameters.
        thinkingLevel: config.thinkingLevel,
        messages,
        tools,
      },
      streamFn: (m, context, options) =>
        streamFn(m as Model<'openai-completions'>, context, options),
      getApiKey: async () => config.apiKey,
      sessionId: conversationId,
      beforeToolCall: async (ctx) => this.beforeToolCall(userId, conversationId, toolMap, ctx),
    });

    const entry: RuntimeEntry = {
      agent,
      userId,
      conversationId,
      apiKey: config.apiKey,
      toolMap,
      nextSeq,
      queue: Promise.resolve(),
    };
    this.entries.set(conversationId, entry);

    // Returning the promise is load-bearing: pi-agent-core awaits each
    // listener before emitting the next event, which serializes message
    // persistence. Discarding it (`void ...`) lets the next message_end read
    // a stale `nextSeq` while the previous insert is still in flight — two
    // rows then race for the same (conversationId, seq) and the losing
    // toolResult is dropped with a unique-constraint error.
    agent.subscribe((event) => this.handleAgentEvent(entry, event));

    return entry;
  }

  /**
   * Destructive tool gate (issue 04): block the call, persist a pending
   * approval, notify the client over SSE and wait for the decision. Approve
   * → undefined (the same tool call then runs with identical arguments);
   * reject/expire → blocked with an explanatory reason the LLM sees as the
   * tool result.
   */
  private async beforeToolCall(
    userId: string,
    conversationId: string,
    toolMap: Map<string, TaskoraAgentTool>,
    ctx: {
      toolCall: { name: string; id: string; arguments: Record<string, unknown> };
    },
  ): Promise<{ block: boolean; reason: string } | undefined> {
    const tool = toolMap.get(ctx.toolCall.name);
    if (!tool?.destructive) return undefined;

    const decision = await this.approvals.requestApproval({
      userId,
      conversationId,
      toolCallId: ctx.toolCall.id,
      toolName: ctx.toolCall.name,
      args: ctx.toolCall.arguments,
    });

    if (decision === 'approve') return undefined;
    return {
      block: true,
      reason:
        decision === 'reject'
          ? 'The user declined this operation. Acknowledge it politely, do not retry it, and offer an alternative if it makes sense.'
          : 'The approval request expired before the user responded. Ask the user whether they still want to proceed.',
    };
  }

  /** Bridge agent events to SSE + persistence. */
  private async handleAgentEvent(entry: RuntimeEntry, event: AgentEvent): Promise<void> {
    const { conversationId } = entry;
    const emit = (sse: AgentSseEvent) => this.hub.emit(conversationId, sse);

    switch (event.type) {
      case 'agent_start':
        emit({ type: 'agent_start' });
        break;
      case 'agent_end':
        await this.conversations.touch(conversationId).catch((error: unknown) => {
          this.logger.warn(`touch failed: ${(error as Error).message}`);
        });
        emit({ type: 'agent_end' });
        void this.maybeGenerateTitle(entry).catch((error: unknown) => {
          this.logger.warn(`Title generation failed: ${(error as Error).message}`);
        });
        this.scheduleIdleCleanup(entry);
        break;
      case 'message_start':
      case 'message_update':
        emit({ type: event.type, message: event.message as unknown as AgentMessageJson });
        break;
      case 'message_end':
        try {
          await this.conversations.appendMessage(
            conversationId,
            event.message as AgentMessage,
            entry.nextSeq,
          );
          entry.nextSeq += 1;
        } catch (error) {
          this.logger.error(`Message persistence failed: ${(error as Error).message}`);
        }
        emit({ type: 'message_end', message: event.message as unknown as AgentMessageJson });
        break;
      case 'tool_execution_start':
        emit({
          type: 'tool_execution_start',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        });
        break;
      case 'tool_execution_end':
        emit({
          type: 'tool_execution_end',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
        });
        // Mutating tools bypass every REST mutation hook, so the client's
        // domain caches (projects/tasks/…) would stay stale until a manual
        // reload. Tell it to refetch right away.
        if (!event.isError && !isReadOnlyToolName(event.toolName)) {
          emit({ type: 'data_changed', toolName: event.toolName });
        }
        break;
      default:
        break;
    }
  }

  /**
   * Auto title (issue 05): after the first exchange, ask the LLM for a short
   * title; fall back to a truncation of the first user message.
   */
  private async maybeGenerateTitle(entry: RuntimeEntry): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: entry.conversationId },
      select: { title: true },
    });
    if (conversation?.title) return;

    const messages = entry.agent.state.messages;
    const firstUser = messages.find(
      (m): m is Extract<AgentMessage, { role: 'user' }> => m.role === 'user',
    );
    if (!firstUser) return;
    const userText =
      typeof firstUser.content === 'string'
        ? firstUser.content
        : firstUser.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map((c) => c.text)
            .join(' ');

    let title = fallbackTitle(userText);
    try {
      const streamFn = await loadCompletionsStreamFn();
      const model = entry.agent.state.model as Model<'openai-completions'>;
      const stream = streamFn(
        model,
        {
          systemPrompt: TITLE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userText, timestamp: Date.now() }],
        },
        // The synthetic provider has no ambient key: pass the BYOK key or
        // streamSimple throws synchronously.
        { apiKey: entry.apiKey },
      );
      const message = await stream.result();
      const text = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join(' ')
        .trim();
      if (text && message.stopReason !== 'error') {
        title = text.slice(0, 200);
      }
    } catch {
      // keep fallback title
    }

    await this.conversations.setTitleIfUnset(entry.conversationId, title);
    const updated = await this.conversations
      .get(entry.userId, entry.conversationId)
      .catch(() => null);
    if (updated) {
      this.hub.emit(entry.conversationId, {
        type: 'conversation_updated',
        conversation: updated,
      });
    }
  }

  /**
   * Drop idle entries so config changes take effect and memory stays bounded.
   * An entry with an open SSE connection or queued work stays alive.
   */
  private scheduleIdleCleanup(entry: RuntimeEntry, delayMs = 5 * 60 * 1000): void {
    setTimeout(() => {
      const current = this.entries.get(entry.conversationId);
      if (current !== entry) return;
      if (current.agent.state.isStreaming) return;
      if (this.hub.listenerCount(entry.conversationId) > 0) return;
      this.entries.delete(entry.conversationId);
    }, delayMs).unref();
  }
}
