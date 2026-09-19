import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskBucket, TaskStatus, ScheduledType } from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('TasksService — trash/restore (no BFS cascade)', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';

  const existingTask = {
    id: 'task-1',
    title: 'Parent task',
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId,
    projectId: null,
    areaId: null,
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  describe('remove (trash)', () => {
    it('throws NotFoundException when task does not exist', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(service.remove(userId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trashes only the task itself (no BFS descendant collection)', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.remove(userId, 'task-1');

      expect(result.trashedAt).toBeInstanceOf(Date);
      // updateMany should set trashedAt for task-1 only (no findMany for BFS)
      const call = mockPrisma.task.updateMany.mock.calls[0][0];
      expect(call.where.id).toBe('task-1');
      expect(call.where.userId).toBe(userId);
      expect(call.data.trashedAt).toBeInstanceOf(Date);
      // status should NOT be in the data (only trashedAt)
      expect(call.data).not.toHaveProperty('status');
    });

    it('does not modify status when trashing', async () => {
      const completedTask = { ...existingTask, status: TaskStatus.COMPLETED, id: 'task-c' };
      mockPrisma.task.findFirst.mockResolvedValue(completedTask);
      mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, 'task-c');

      const call = mockPrisma.task.updateMany.mock.calls[0][0];
      expect(call.data).toEqual({ trashedAt: expect.any(Date) });
      expect(call.data).not.toHaveProperty('status');
    });
  });

  describe('restore', () => {
    it('throws NotFoundException when task does not exist', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(service.restore(userId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('restores only the task itself (no BFS descendant collection)', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(existingTask);
      mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.restore(userId, 'task-1');

      expect(result.trashedAt).toBeNull();
      const call = mockPrisma.task.updateMany.mock.calls[0][0];
      expect(call.where.id).toBe('task-1');
      expect(call.where.userId).toBe(userId);
      expect(call.data.trashedAt).toBeNull();
    });

    it('restore 一律回 ACTIVE 并清空了结时间（spec: task-cancelled story 19）', async () => {
      // 已取消的任务从 Trash 捡回 → 未了结
      const cancelledTask = {
        ...existingTask,
        status: TaskStatus.CANCELLED,
        settledAt: new Date(),
        id: 'task-x',
      };
      mockPrisma.task.findFirst.mockResolvedValue(cancelledTask);
      mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

      await service.restore(userId, 'task-x');

      const call = mockPrisma.task.updateMany.mock.calls[0][0];
      expect(call.data).toEqual({
        trashedAt: null,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      });
    });
  });
});
