import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskBucket, TaskStatus } from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('TasksService — logbook view', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      task: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  it('filters to status=COMPLETED tasks', async () => {
    const userId = 'user-1';
    const completed = [
      {
        id: 'task-1',
        title: 'Done task',
        status: TaskStatus.COMPLETED,
        completedAt: new Date('2025-07-24T10:00:00Z'),
        bucket: TaskBucket.INBOX,
        userId,
        tags: [],
      },
    ];
    mockPrisma.task.findMany.mockResolvedValue(completed);

    const result = await service.findAll(userId, { view: 'logbook' });

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
      where: { userId, status: TaskStatus.COMPLETED, trashedAt: null },
      orderBy: [{ completedAt: 'desc' }],
      include: { tags: { include: { tag: true } } },
    });
    expect(result).toEqual([{ ...completed[0], tags: [] }]);
    expect(result.every((t) => t.status === TaskStatus.COMPLETED)).toBe(true);
  });

  it('orders by completedAt desc (not the default sortOrder asc + createdAt desc)', async () => {
    const userId = 'user-1';
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll(userId, { view: 'logbook' });

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ completedAt: 'desc' }],
      }),
    );
  });

  it('excludes ACTIVE tasks (no such status leaks via where clause)', async () => {
    const userId = 'user-1';
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll(userId, { view: 'logbook' });

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    // The where clause must constrain status to COMPLETED only.
    expect(call.where.status).toBe(TaskStatus.COMPLETED);
    // No OR clause that would broaden to ACTIVE.
    expect(call.where.OR).toBeUndefined();
  });
});