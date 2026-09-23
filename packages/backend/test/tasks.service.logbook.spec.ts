import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskBucket, TaskStatus } from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

/**
 * Logbook = 已了结（完成 + 取消）任务的档案（spec: task-cancelled）。
 * where 必须是白名单式 status in [COMPLETED, CANCELLED]，按 settledAt 排序。
 */
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

  it('filters to settled tasks (status in [COMPLETED, CANCELLED])', async () => {
    const userId = 'user-1';
    const settled = [
      {
        id: 'task-1',
        title: 'Done task',
        status: TaskStatus.COMPLETED,
        settledAt: new Date('2025-07-24T10:00:00Z'),
        bucket: TaskBucket.INBOX,
        userId,
        repeatRule: null,
        tags: [],
      },
      {
        id: 'task-2',
        title: 'Cancelled task',
        status: TaskStatus.CANCELLED,
        settledAt: new Date('2025-07-25T10:00:00Z'),
        bucket: TaskBucket.INBOX,
        userId,
        repeatRule: null,
        tags: [],
      },
    ];
    mockPrisma.task.findMany.mockResolvedValue(settled);

    const result = await service.findAll(userId, { view: 'logbook' });

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
      where: {
        userId,
        status: { in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
        trashedAt: null,
      },
      orderBy: [{ settledAt: 'desc' }],
      include: { tags: { include: { tag: true } } },
    });
    // mapper 只做键重命名（settledAt → completedAt），Date 序列化发生在 HTTP 层
    const { settledAt: settled0, ...rest0 } = settled[0];
    const { settledAt: settled1, ...rest1 } = settled[1];
    expect(result).toEqual([
      { ...rest0, tags: [], completedAt: settled0 },
      { ...rest1, tags: [], completedAt: settled1 },
    ]);
    expect(
      result.every(
        (t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CANCELLED,
      ),
    ).toBe(true);
  });

  it('orders by settledAt desc (not the default sortOrder asc + createdAt desc)', async () => {
    const userId = 'user-1';
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll(userId, { view: 'logbook' });

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ settledAt: 'desc' }],
      }),
    );
  });

  it('excludes ACTIVE tasks (no such status leaks via where clause)', async () => {
    const userId = 'user-1';
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll(userId, { view: 'logbook' });

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    // The where clause must be a whitelist of settled statuses.
    expect(call.where.status).toEqual({
      in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
    });
    // No OR clause that would broaden to ACTIVE.
    expect(call.where.OR).toBeUndefined();
  });

  it('maps the physical settledAt column to the DTO completedAt field', async () => {
    const userId = 'user-1';
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Cancelled task',
        status: TaskStatus.CANCELLED,
        settledAt: new Date('2025-07-25T10:00:00Z'),
        bucket: TaskBucket.INBOX,
        userId,
        repeatRule: null,
        tags: [],
      },
    ]);

    const result = await service.findAll(userId, { view: 'logbook' });

    expect(result[0].completedAt).toEqual(new Date('2025-07-25T10:00:00Z'));
    expect('settledAt' in result[0]).toBe(false);
  });
});
