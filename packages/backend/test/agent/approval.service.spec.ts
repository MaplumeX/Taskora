import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { AgentApprovalService } from '../../src/agent/approvals/approval.service';
import { APPROVAL_TIMEOUT_MS } from '../../src/agent/approvals/approval.service';

type ApprovalRow = {
  id: string;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  args: object;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
};

function createRow(partial: Partial<ApprovalRow>): ApprovalRow {
  return {
    id: partial.id ?? 'approval-1',
    conversationId: partial.conversationId ?? 'conv-1',
    toolCallId: partial.toolCallId ?? 'call-1',
    toolName: partial.toolName ?? 'delete_task',
    args: partial.args ?? { id: 't1' },
    status: partial.status ?? 'pending',
    createdAt: new Date(),
    resolvedAt: partial.resolvedAt ?? null,
  };
}

function createService() {
  const hub = { emit: vi.fn() };
  const rows = new Map<string, ApprovalRow>();
  const prisma = {
    agentApproval: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = createRow({
          id: 'approval-1',
          conversationId: data.conversationId as string,
          toolCallId: data.toolCallId as string,
          toolName: data.toolName as string,
        });
        rows.set(row.id, row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const { id, conversation } = where as { id: string; conversation?: { userId?: string } };
        const row = rows.get(id);
        if (!row) return null;
        if (conversation?.userId && conversation.userId !== 'user-1') return null;
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        [...rows.values()].filter(
          (r) => where.conversationId === r.conversationId && where.status === 'pending',
        ),
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = rows.get(where.id);
          if (!row) throw new Error('not found');
          row.status = data.status as string;
          row.resolvedAt = data.resolvedAt as Date;
          return row;
        },
      ),
    },
  };
  const service = new AgentApprovalService(prisma as never, hub as never);
  return { service, prisma, hub, rows };
}

describe('AgentApprovalService', () => {
  let ctx: ReturnType<typeof createService>;

  beforeEach(() => {
    ctx = createService();
  });

  it('emits approval_request and waits for the decision', async () => {
    const pending = ctx.service.requestApproval({
      userId: 'user-1',
      conversationId: 'conv-1',
      toolCallId: 'call-1',
      toolName: 'empty_trash',
      args: {},
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.hub.emit).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ type: 'approval_request' }),
    );

    const resolved = await ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'approve');
    expect(resolved.status).toBe('approved');
    expect(await pending).toBe('approve');
    expect(ctx.hub.emit).toHaveBeenLastCalledWith(
      'conv-1',
      expect.objectContaining({ type: 'approval_resolved' }),
    );
  });

  it('rejecting resolves the waiter with reject', async () => {
    const pending = ctx.service.requestApproval({
      userId: 'user-1',
      conversationId: 'conv-1',
      toolCallId: 'call-2',
      toolName: 'delete_area',
      args: { id: 'a1' },
    });
    await new Promise((r) => setTimeout(r, 10));
    await ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'reject');
    expect(await pending).toBe('reject');
  });

  it('throws NotFound for foreign users and unknown ids', async () => {
    const pending = ctx.service
      .requestApproval({
        userId: 'user-1',
        conversationId: 'conv-1',
        toolCallId: 'call-1',
        toolName: 'delete_task',
        args: {},
      })
      .catch(() => 'reject');
    await new Promise((r) => setTimeout(r, 10));
    await expect(ctx.service.resolve('user-2', 'conv-1', 'approval-1', 'approve')).rejects.toThrow(
      NotFoundException,
    );
    await expect(ctx.service.resolve('user-1', 'conv-1', 'missing', 'approve')).rejects.toThrow(
      NotFoundException,
    );
    await ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'reject');
    expect(await pending).toBe('reject');
  });

  it('throws Conflict when already resolved', async () => {
    const pending = ctx.service.requestApproval({
      userId: 'user-1',
      conversationId: 'conv-1',
      toolCallId: 'call-1',
      toolName: 'delete_task',
      args: {},
    });
    await new Promise((r) => setTimeout(r, 10));
    await ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'approve');
    expect(await pending).toBe('approve');
    await expect(ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'reject')).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejectAllPending unblocks every waiter', async () => {
    ctx.prisma.agentApproval.findMany.mockImplementationOnce(async () => [createRow({})]);
    const p = ctx.service
      .requestApproval({
        userId: 'user-1',
        conversationId: 'conv-1',
        toolCallId: 'call-1',
        toolName: 'delete_task',
        args: {},
      })
      .catch(() => 'reject');
    await new Promise((r) => setTimeout(r, 10));
    // Simulate conversation deletion: pending rows found in db, waiter still set.
    await ctx.service.rejectAllPending('conv-1');
    expect(await p).toBe('reject');
  });

  it('uses a 10 minute timeout', () => {
    expect(APPROVAL_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});
