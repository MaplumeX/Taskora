import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AgentApproval } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { AgentApprovalDto, ApprovalDecision } from '@taskora/shared';
import { AgentEventHub } from '../runtime/agent-event-hub';

/** How long an approval card stays actionable before it expires. */
export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

interface ApprovalWaiter {
  resolve: (decision: ApprovalDecision | 'expire') => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Destructive-operation approval flow (issue 04).
 *
 * `requestApproval()` is called from the agent's `beforeToolCall` hook and
 * blocks the run until the user decides, the timeout elapses, or the
 * conversation goes away. Approving resolves with `approve` so the exact same
 * tool call continues; rejecting resolves with `reject` and the loop emits an
 * error tool result the LLM can respond to naturally.
 */
@Injectable()
export class AgentApprovalService {
  private waiters = new Map<string, ApprovalWaiter>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: AgentEventHub,
  ) {}

  /**
   * Create a pending approval and wait for the user's decision.
   * Emits `approval_request` over SSE immediately.
   */
  async requestApproval(input: {
    userId: string;
    conversationId: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<ApprovalDecision | 'expire'> {
    const approval = await this.prisma.agentApproval.create({
      data: {
        conversationId: input.conversationId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        args: input.args as object,
        status: 'pending',
      },
    });
    this.hub.emit(input.conversationId, {
      type: 'approval_request',
      approval: this.toDto(approval),
    });

    return new Promise<ApprovalDecision | 'expire'>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(approval.id);
        void this.finalize(approval.id, 'expired');
      }, APPROVAL_TIMEOUT_MS);
      this.waiters.set(approval.id, { resolve, timer });
    });
  }

  /** POST /agent/conversations/:id/approvals/:approvalId — user decision. */
  async resolve(
    userId: string,
    conversationId: string,
    approvalId: string,
    decision: ApprovalDecision,
  ): Promise<AgentApprovalDto> {
    const approval = await this.prisma.agentApproval.findFirst({
      where: { id: approvalId, conversation: { id: conversationId, userId } },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.status !== 'pending') {
      throw new ConflictException(`Approval already ${approval.status}`);
    }

    const updated = await this.finalize(
      approval.id,
      decision === 'approve' ? 'approved' : 'rejected',
    );
    const waiter = this.waiters.get(approval.id);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.waiters.delete(approval.id);
      waiter.resolve(decision);
    }
    return updated;
  }

  /** Pending approvals for a conversation (SSE reconnect re-render). */
  async listPending(userId: string, conversationId: string): Promise<AgentApprovalDto[]> {
    const rows = await this.prisma.agentApproval.findMany({
      where: { conversationId, conversation: { userId }, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Reject everything still pending for a conversation — used when the
   * conversation is deleted so a waiting agent run unblocks immediately.
   */
  async rejectAllPending(conversationId: string): Promise<void> {
    const pending = await this.prisma.agentApproval.findMany({
      where: { conversationId, status: 'pending' },
    });
    for (const approval of pending) {
      const waiter = this.waiters.get(approval.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.waiters.delete(approval.id);
        waiter.resolve('reject');
      }
      await this.finalize(approval.id, 'rejected').catch(() => undefined);
    }
  }

  private async finalize(
    approvalId: string,
    status: 'approved' | 'rejected' | 'expired',
  ): Promise<AgentApprovalDto> {
    const updated = await this.prisma.agentApproval.update({
      where: { id: approvalId },
      data: { status, resolvedAt: new Date() },
    });
    this.hub.emit(updated.conversationId, {
      type: 'approval_resolved',
      approval: this.toDto(updated),
    });
    return this.toDto(updated);
  }

  private toDto(approval: AgentApproval): AgentApprovalDto {
    return {
      id: approval.id,
      conversationId: approval.conversationId,
      toolCallId: approval.toolCallId,
      toolName: approval.toolName,
      args: (approval.args ?? {}) as Record<string, unknown>,
      status: approval.status as AgentApprovalDto['status'],
      createdAt: approval.createdAt.toISOString(),
      resolvedAt: approval.resolvedAt?.toISOString() ?? null,
    };
  }
}
