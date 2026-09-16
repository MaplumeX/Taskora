import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { AgentApprovalService } from '../../src/agent/approvals/approval.service';
import { APPROVAL_TIMEOUT_MS } from '../../src/agent/approvals/approval.service';

type ApprovalRow = {
  id: string;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  args: object;
  labels: Record<string, string>;
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
    labels: partial.labels ?? {},
    status: partial.status ?? 'pending',
    createdAt: partial.createdAt ?? new Date(),
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
          args: data.args as object,
          labels: (data.labels as Record<string, string>) ?? {},
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

function request(ctx: ReturnType<typeof createService>, overrides = {}) {
  return ctx.service.requestApproval({
    conversationId: 'conv-1',
    toolCallId: 'call-1',
    toolName: 'empty_trash',
    args: {},
    ...overrides,
  });
}

describe('AgentApprovalService', () => {
  let ctx: ReturnType<typeof createService>;

  beforeEach(() => {
    ctx = createService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits approval_request and waits for the decision', async () => {
    const pending = ctx.service.requestApproval({
      conversationId: 'conv-1',
      toolCallId: 'call-1',
      toolName: 'empty_trash',
      args: {},
      labels: {},
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

  it('persists labels with the approval for the UI card', async () => {
    const pending = ctx.service.requestApproval({
      conversationId: 'conv-1',
      toolCallId: 'call-1',
      toolName: 'delete_area',
      args: { id: 'area-1' },
      labels: { 'area-1': 'Work' },
    });
    await new Promise((r) => setTimeout(r, 10));
    await ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'approve');
    expect(await pending).toBe('approve');

    const emitted = ctx.hub.emit.mock.calls.at(-1)?.[1] as {
      approval: { labels: Record<string, string> };
    };
    expect(emitted.approval.labels).toEqual({ 'area-1': 'Work' });
  });

  it('rejecting resolves the waiter with reject', async () => {
    const pending = ctx.service.requestApproval({
      conversationId: 'conv-1',
      toolCallId: 'call-2',
      toolName: 'delete_area',
      args: { id: 'a1' },
    });
    await new Promise((r) => setTimeout(r, 10));
    await ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'reject');
    expect(await pending).toBe('reject');
  });

  it('resolves the waiter with expire on timeout so the run never deadlocks', async () => {
    vi.useFakeTimers();
    const pending = request(ctx);
    await vi.advanceTimersByTimeAsync(10);

    await vi.advanceTimersByTimeAsync(APPROVAL_TIMEOUT_MS);
    // The blocked beforeToolCall must wake up — otherwise the agent run and
    // every message queued behind it hang forever.
    expect(await pending).toBe('expire');
    expect(ctx.rows.get('approval-1')?.status).toBe('expired');

    // The expired row is no longer resolvable.
    await expect(ctx.service.resolve('user-1', 'conv-1', 'approval-1', 'approve')).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws NotFound for foreign users and unknown ids', async () => {
    const pending = ctx.service
      .requestApproval({
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

  it('resolving a pending row without a waiter (restart orphan) expires it and fails loudly', async () => {
    // Simulate a row left pending by a restart: DB row exists, no waiter.
    ctx.rows.set('orphan', createRow({ id: 'orphan', status: 'pending', createdAt: new Date() }));
    await expect(ctx.service.resolve('user-1', 'conv-1', 'orphan', 'approve')).rejects.toThrow(
      ConflictException,
    );
    expect(ctx.rows.get('orphan')?.status).toBe('expired');
  });

  it('expireAllPending unblocks every waiter with expire', async () => {
    ctx.prisma.agentApproval.findMany.mockImplementationOnce(async () => [createRow({})]);
    const p = request(ctx);
    await new Promise((r) => setTimeout(r, 10));
    // Simulate run teardown (conversation deleted / restart): pending rows
    // found in db, waiter still set.
    await ctx.service.expireAllPending('conv-1');
    expect(await p).toBe('expire');
    expect(ctx.rows.get('approval-1')?.status).toBe('expired');
  });

  it('uses a 10 minute timeout', () => {
    expect(APPROVAL_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});
