import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskStatus } from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { SubtasksService } from '../src/subtasks/subtasks.service';

describe('SubtasksService', () => {
  let service: SubtasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';
  const taskId = 'task-1';

  const baseSubtask = {
    id: 'subtask-1',
    title: 'Subtask',
    status: TaskStatus.ACTIVE,
    completedAt: null,
    sortOrder: 0,
    taskId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        findFirst: vi.fn(),
      },
      subtask: {
        aggregate: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new SubtasksService(mockPrisma);
  });

  describe('create', () => {
    it('throws NotFoundException when task does not exist or not owned', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.create(userId, 'nonexistent', { title: 'Sub' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('computes sortOrder = max + 1 and creates subtask', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: taskId });
      mockPrisma.subtask.aggregate.mockResolvedValue({ _max: { sortOrder: 3 } });
      mockPrisma.subtask.create.mockResolvedValue({
        ...baseSubtask,
        sortOrder: 4,
      });

      const result = await service.create(userId, taskId, { title: 'New' });

      expect(mockPrisma.subtask.create).toHaveBeenCalledWith({
        data: { title: 'New', taskId, sortOrder: 4 },
      });
      expect(result.sortOrder).toBe(4);
    });

    it('defaults sortOrder to 0 when no existing subtasks (max is null)', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: taskId });
      mockPrisma.subtask.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrisma.subtask.create.mockResolvedValue({
        ...baseSubtask,
        sortOrder: 0,
      });

      const result = await service.create(userId, taskId, { title: 'First' });

      expect(mockPrisma.subtask.create).toHaveBeenCalledWith({
        data: { title: 'First', taskId, sortOrder: 0 },
      });
      expect(result.sortOrder).toBe(0);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when subtask not found', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue(null);

      await expect(
        service.update(userId, 'nonexistent', { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when subtask belongs to another user', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        task: { userId: 'other-user' },
      });

      await expect(
        service.update(userId, baseSubtask.id, { title: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates title only', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        task: { userId },
      });
      mockPrisma.subtask.update.mockResolvedValue({
        ...baseSubtask,
        title: 'Updated',
      });

      const result = await service.update(userId, baseSubtask.id, {
        title: 'Updated',
      });

      expect(mockPrisma.subtask.update).toHaveBeenCalledWith({
        where: { id: baseSubtask.id },
        data: { title: 'Updated' },
      });
      expect(result.title).toBe('Updated');
    });

    it('sets status COMPLETED and completedAt when status changed to COMPLETED', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        task: { userId },
      });
      mockPrisma.subtask.update.mockResolvedValue({
        ...baseSubtask,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      });

      await service.update(userId, baseSubtask.id, {
        status: TaskStatus.COMPLETED,
      });

      const call = mockPrisma.subtask.update.mock.calls[0][0];
      expect(call.data.status).toBe(TaskStatus.COMPLETED);
      expect(call.data.completedAt).toBeInstanceOf(Date);
    });

    it('sets status ACTIVE and clears completedAt when status changed to ACTIVE', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        task: { userId },
      });
      mockPrisma.subtask.update.mockResolvedValue({
        ...baseSubtask,
        status: TaskStatus.ACTIVE,
        completedAt: null,
      });

      await service.update(userId, baseSubtask.id, {
        status: TaskStatus.ACTIVE,
      });

      const call = mockPrisma.subtask.update.mock.calls[0][0];
      expect(call.data.status).toBe(TaskStatus.ACTIVE);
      expect(call.data.completedAt).toBeNull();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when subtask not found', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue(null);

      await expect(service.remove(userId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when subtask belongs to another user', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        task: { userId: 'other-user' },
      });

      await expect(service.remove(userId, baseSubtask.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes the subtask when ownership is verified', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        task: { userId },
      });
      mockPrisma.subtask.delete.mockResolvedValue(baseSubtask);

      await service.remove(userId, baseSubtask.id);

      expect(mockPrisma.subtask.delete).toHaveBeenCalledWith({
        where: { id: baseSubtask.id },
      });
    });
  });

  describe('complete', () => {
    it('throws NotFoundException when subtask not found', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue(null);

      await expect(service.complete(userId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets status COMPLETED and completedAt', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        task: { userId },
      });
      mockPrisma.subtask.update.mockResolvedValue({
        ...baseSubtask,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      });

      const result = await service.complete(userId, baseSubtask.id);

      const call = mockPrisma.subtask.update.mock.calls[0][0];
      expect(call.data.status).toBe(TaskStatus.COMPLETED);
      expect(call.data.completedAt).toBeInstanceOf(Date);
      expect(result.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('uncomplete', () => {
    it('throws NotFoundException when subtask not found', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue(null);

      await expect(service.uncomplete(userId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets status ACTIVE and clears completedAt', async () => {
      mockPrisma.subtask.findFirst.mockResolvedValue({
        ...baseSubtask,
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        task: { userId },
      });
      mockPrisma.subtask.update.mockResolvedValue({
        ...baseSubtask,
        status: TaskStatus.ACTIVE,
        completedAt: null,
      });

      const result = await service.uncomplete(userId, baseSubtask.id);

      const call = mockPrisma.subtask.update.mock.calls[0][0];
      expect(call.data.status).toBe(TaskStatus.ACTIVE);
      expect(call.data.completedAt).toBeNull();
      expect(result.status).toBe(TaskStatus.ACTIVE);
    });
  });

  describe('reorder', () => {
    it('throws NotFoundException when task does not exist or not owned', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);

      await expect(
        service.reorder(userId, 'nonexistent', ['s1', 's2']),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when a subtask id does not belong to the task', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: taskId });
      mockPrisma.subtask.findMany.mockResolvedValue([{ id: 's1' }]);

      await expect(
        service.reorder(userId, taskId, ['s1', 'foreign']),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates sortOrder for all subtasks in a transaction', async () => {
      const orderedIds = ['s1', 's2', 's3'];
      mockPrisma.task.findFirst.mockResolvedValue({ id: taskId });
      mockPrisma.subtask.findMany.mockResolvedValue([
        { id: 's1' },
        { id: 's2' },
        { id: 's3' },
      ]);
      mockPrisma.subtask.update.mockResolvedValue(baseSubtask);

      await service.reorder(userId, taskId, orderedIds);

      expect(mockPrisma.subtask.findMany).toHaveBeenCalledWith({
        where: { id: { in: orderedIds }, taskId },
        select: { id: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.subtask.update).toHaveBeenCalledTimes(3);
      expect(mockPrisma.subtask.update).toHaveBeenNthCalledWith(1, {
        where: { id: 's1' },
        data: { sortOrder: 0 },
      });
      expect(mockPrisma.subtask.update).toHaveBeenNthCalledWith(2, {
        where: { id: 's2' },
        data: { sortOrder: 1 },
      });
      expect(mockPrisma.subtask.update).toHaveBeenNthCalledWith(3, {
        where: { id: 's3' },
        data: { sortOrder: 2 },
      });
    });

    it('handles duplicate ids as ownership mismatch', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: taskId });
      mockPrisma.subtask.findMany.mockResolvedValue([{ id: 's1' }]);

      await expect(
        service.reorder(userId, taskId, ['s1', 's1']),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
