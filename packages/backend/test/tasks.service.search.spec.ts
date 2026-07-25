import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskBucket, TaskStatus } from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('TasksService — search (q param)', () => {
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

  it('builds OR contains on title and notes for q', async () => {
    const userId = 'user-1';
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll(userId, { q: 'meeting' });

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    expect(call.where.userId).toBe(userId);
    expect(call.where.OR).toEqual([
      { title: { contains: 'meeting', mode: 'insensitive' } },
      { notes: { contains: 'meeting', mode: 'insensitive' } },
    ]);
  });

  it('defaults status to ACTIVE when q is set without view or completed', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll('user-1', { q: 'task' });

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    expect(call.where.status).toBe(TaskStatus.ACTIVE);
  });

  it('sets status to [ACTIVE, COMPLETED] when q + completed=true (excludes TRASHED)', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll('user-1', { q: 'task', completed: true });

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    expect(call.where.status).toEqual({
      in: [TaskStatus.ACTIVE, TaskStatus.COMPLETED],
    });
  });

  it('uses default sort (sortOrder asc, createdAt desc) for q search', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll('user-1', { q: 'task' });

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([
      { sortOrder: 'asc' },
      { createdAt: 'desc' },
    ]);
  });

  it('does not set OR or override status when q is empty/undefined', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll('user-1', {});

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeUndefined();
    expect(call.where.status).toBe(TaskStatus.ACTIVE);
  });

  it('maps taskTags to tags array in results', async () => {
    const userId = 'user-1';
    const taskWithTags = {
      id: 'task-1',
      title: 'Test task',
      status: TaskStatus.ACTIVE,
      bucket: TaskBucket.INBOX,
      userId,
      tags: [{ tag: { id: 'tag-1', name: 'urgent', color: '#ff0000' } }],
    };
    mockPrisma.task.findMany.mockResolvedValue([taskWithTags]);

    const result = await service.findAll(userId, { q: 'test' });

    expect(result[0].tags).toEqual([
      { id: 'tag-1', name: 'urgent', color: '#ff0000' },
    ]);
  });

  it('applies q OR condition alongside view status logic when both are set', async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);

    await service.findAll('user-1', { q: 'task', view: 'today' });

    const call = mockPrisma.task.findMany.mock.calls[0][0];
    // q OR is present
    expect(call.where.OR).toBeDefined();
    // view's status takes precedence (ACTIVE for today)
    expect(call.where.status).toBe(TaskStatus.ACTIVE);
  });
});