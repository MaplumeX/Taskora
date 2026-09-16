import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AgentApproval } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { AgentApprovalDto, ApprovalDecision } from '@taskora/shared';
import { AgentEventHub } from '../runtime/agent-event-hub';

/** How long an approval card stays actionable before it expires. */
export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

/** Outcome of a blocked tool call: the user's decision, or expiry. */
export type ApprovalOutcome = ApprovalDecision | 'expire';

interface ApprovalWaiter {
  resolve: (outcome: ApprovalOutcome) => void;
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
 *
 * NOTE: waiters live in this process's memory. The approval flow therefore
 * assumes a single backend instance (see ADR 0003); horizontal scaling needs
 * sticky sessions or an externalized wake-up mechanism.
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
   * Emits `approval_request` over SSE immediately. `labels` maps entity ids
   * in `args` to human-readable titles so the approval card can show
   * "Work" instead of a database id.
   */
  async requestApproval(input: {
    conversationId: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    labels?: Record<string, string>;
  }): Promise<ApprovalOutcome> {
    const approval = await this.prisma.agentApproval.create({
      data: {
        conversationId: input.conversationId,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        args: input.args as object,
        labels: input.labels ?? {},
      },
    });
    this.hub.emit(input.conversationId, {
      type: 'approval_request',
      approval: this.toDto(approval),
    });

    return new Promise<ApprovalOutcome>((resolve) => {
      const timer = setTimeout(() => {
        // Wake the blocked run first, then flip the row: forgetting to
        // resolve here would leave the agent run (and every message queued
        // behind it) stuck forever.
        this.waiters.delete(approval.id);
        resolve('expire');
        void this.finalize(approval.id, 'expired').catch(() => undefined);
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

    const waiter = this.waiters.get(approval.id);
    if (!waiter) {
      // Pending row without a waiter: the backing run died with a restart or
      // reconfiguration. Nothing can act on this decision anymore, so expire
      // the card instead of reporting a success that executed nothing.
      await this.finalize(approval.id, 'expired').catch(() => undefined);
      throw new ConflictException('Approval is no longer actionable');
    }

    const updated = await this.finalize(
      approval.id,
      decision === 'approve' ? 'approved' : 'rejected',
    );
    clearTimeout(waiter.timer);
    this.waiters.delete(approval.id);
    waiter.resolve(decision);
    return updated;
  }

  /** Pending approvals for a conversation (SSE reconnect re-render). */
  async listPending(userId: string, conversationId: string): Promise<AgentApprovalDto[]> {
    const rows = await this.prisma.agentApproval.findMany({
      where: { conversationId, conversation: { userId }, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    const fresh: AgentApproval[] = [];
    const deadline = Date.now() - APPROVAL_TIMEOUT_MS;
    for (const row of rows) {
      // Rows left pending by a restart (no waiter to expire them) go stale:
      // expire them here so the UI never shows an actionable dead card.
      if (row.createdAt.getTime() < deadline) {
        await this.finalize(row.id, 'expired').catch(() => undefined);
        continue;
      }
      // Skip rows whose waiter died with a restart — nothing can act on them
      // anymore, so surface only approvals that can still be resolved.
      if (!this.waiters.has(row.id)) {
        await this.finalize(row.id, 'expired').catch(() => undefined);
        continue;
      }
      fresh.push(row);
    }
    return fresh.map((row) => this.toDto(row));
  }

  /**
   * Expire everything still pending for a conversation — used when the
   * conversation is deleted, the run is torn down (restart, BYOK config
   * change) so a waiting agent run unblocks immediately. Resolves waiters
   * with `expire` rather than `reject`: the user did not decline anything,
   * the run was simply interrupted.
   */
  async expireAllPending(conversationId: string): Promise<void> {
    const pending = await this.prisma.agentApproval.findMany({
      where: { conversationId, status: 'pending' },
    });
    for (const approval of pending) {
      const waiter = this.waiters.get(approval.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.waiters.delete(approval.id);
        waiter.resolve('expire');
      }
      await this.finalize(approval.id, 'expired').catch(() => undefined);
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
      labels: ((approval.labels ?? {}) as Record<string, string>) ?? {},
      status: approval.status as AgentApprovalDto['status'],
      createdAt: approval.createdAt.toISOString(),
      resolvedAt: approval.resolvedAt?.toISOString() ?? null,
    };
  }
}
