import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('TasksService — reorder', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      task: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((promises: unknown[]) => Promise.all(promises)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  it('should update sortOrder for all orderedIds in a transaction', async () => {
    const userId = 'user-1';
    const orderedIds = ['task-1', 'task-2', 'task-3'];
    mockPrisma.task.findMany.mockResolvedValue([
      { id: 'task-1' },
      { id: 'task-2' },
      { id: 'task-3' },
    ]);
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

    await service.reorder(userId, orderedIds);

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
      where: { id: { in: orderedIds }, userId },
      select: { id: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.task.updateMany).toHaveBeenCalledTimes(3);
    expect(mockPrisma.task.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'task-1', userId },
      data: { sortOrder: 0 },
    });
    expect(mockPrisma.task.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'task-2', userId },
      data: { sortOrder: 1 },
    });
    expect(mockPrisma.task.updateMany).toHaveBeenNthCalledWith(3, {
      where: { id: 'task-3', userId },
      data: { sortOrder: 2 },
    });
  });

  it('should throw NotFoundException when an id is not owned by the user', async () => {
    const userId = 'user-1';
    const orderedIds = ['task-1', 'foreign-task'];
    mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);

    await expect(service.reorder(userId, orderedIds)).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when an id does not exist', async () => {
    const userId = 'user-1';
    const orderedIds = ['task-1', 'nonexistent'];
    mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);

    await expect(service.reorder(userId, orderedIds)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should handle duplicate ids in orderedIds as ownership mismatch', async () => {
    const userId = 'user-1';
    const orderedIds = ['task-1', 'task-1'];
    mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);

    await expect(service.reorder(userId, orderedIds)).rejects.toThrow(
      NotFoundException,
    );
  });
});