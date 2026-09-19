import { TaskBucket, TaskStatus } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

/**
 * TasksService 终态操作（spec: task-cancelled）——cancel / uncancel、
 * COMPLETED ↔ CANCELLED 直接改写、reopen 清空 settledAt。
 * 只断言外部可观察行为：传给 Prisma 的 where/data、返回的 DTO。
 */
describe('TasksService — cancel / uncancel (terminal state)', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';
  const baseTask = {
    id: 'task-1',
    title: 'Learn Japanese',
    status: TaskStatus.ACTIVE,
    settledAt: null,
    bucket: TaskBucket.INBOX,
    userId,
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  it('throws NotFoundException when task does not exist or not owned', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null);

    await expect(service.cancel(userId, 'nonexistent')).rejects.toThrow();
    await expect(service.uncancel(userId, 'nonexistent')).rejects.toThrow();
  });

  it('cancel writes status CANCELLED and settledAt', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(baseTask);
    mockPrisma.task.update.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.CANCELLED,
      settledAt: new Date('2026-09-19T00:00:00Z'),
    });

    const result = await service.cancel(userId, baseTask.id);

    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: baseTask.id },
      data: {
        status: TaskStatus.CANCELLED,
        settledAt: expect.any(Date),
      },
    });
    // DTO 字段名保持 completedAt，承载 Settled At 语义（ADR 0006）。
    expect(result.status).toBe(TaskStatus.CANCELLED);
    expect(result.completedAt).toEqual(new Date('2026-09-19T00:00:00Z'));
    expect('settledAt' in result).toBe(false);
  });

  it('cancel rewrites COMPLETED → CANCELLED directly (no reopen step) and refreshes settledAt', async () => {
    const oldSettledAt = new Date('2026-01-01T00:00:00Z');
    mockPrisma.task.findFirst.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.COMPLETED,
      settledAt: oldSettledAt,
    });
    mockPrisma.task.update.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.CANCELLED,
      settledAt: new Date(),
    });

    await service.cancel(userId, baseTask.id);

    const call = mockPrisma.task.update.mock.calls[0][0];
    expect(call.data.status).toBe(TaskStatus.CANCELLED);
    expect(call.data.settledAt).toBeInstanceOf(Date);
    // 终态改写刷新了结时间，而非保留原完成时间
    expect(call.data.settledAt.getTime()).toBeGreaterThan(oldSettledAt.getTime());
    // 没有中间的 uncomplete 步骤（只有一次写）
    expect(mockPrisma.task.update).toHaveBeenCalledTimes(1);
  });

  it('complete rewrites CANCELLED → COMPLETED directly', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.CANCELLED,
      settledAt: new Date('2026-01-01T00:00:00Z'),
    });
    mockPrisma.task.update.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.COMPLETED,
      settledAt: new Date(),
    });

    await service.complete(userId, baseTask.id);

    const call = mockPrisma.task.update.mock.calls[0][0];
    expect(call.data.status).toBe(TaskStatus.COMPLETED);
    expect(call.data.settledAt).toBeInstanceOf(Date);
    expect(mockPrisma.task.update).toHaveBeenCalledTimes(1);
  });

  it('uncancel returns to ACTIVE and clears settledAt', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.CANCELLED,
      settledAt: new Date(),
    });
    mockPrisma.task.update.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.ACTIVE,
      settledAt: null,
    });

    const result = await service.uncancel(userId, baseTask.id);

    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: baseTask.id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
    });
    expect(result.status).toBe(TaskStatus.ACTIVE);
    expect(result.completedAt).toBeNull();
  });

  it('uncomplete of a cancelled task also returns to ACTIVE (reopen 统一回 ACTIVE)', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.CANCELLED,
      settledAt: new Date(),
    });
    mockPrisma.task.update.mockResolvedValue({
      ...baseTask,
      status: TaskStatus.ACTIVE,
      settledAt: null,
    });

    await service.uncomplete(userId, baseTask.id);

    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: baseTask.id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
    });
  });
});
