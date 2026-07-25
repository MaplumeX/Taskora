import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';
import { TaskBucket, TaskStatus } from '@taskora/shared';

describe('TasksService tagIds set semantics', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const taskId = 'task-1';
  const userId = 'user-1';
  const existingTask = {
    id: taskId,
    title: 'Task',
    notes: null,
    scheduledDate: null,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId,
    parentId: null,
    projectId: null,
    areaId: null,
  };

  beforeEach(() => {
    const deleteMany = vi.fn();
    const createMany = vi.fn();
    mockPrisma = {
      task: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      taskTag: {
        deleteMany,
        createMany,
      },
      $transaction: vi.fn((promises: unknown[]) => Promise.all(promises)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  it('should add tags when tagIds is a non-empty array', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(existingTask);
    const updatedTask = { ...existingTask, title: 'Task' };
    mockPrisma.task.update.mockResolvedValue({ ...updatedTask, tags: [] });

    const tagIds = ['tag-a', 'tag-b'];
    await service.update(userId, taskId, { tagIds });

    expect(mockPrisma.taskTag.deleteMany).toHaveBeenCalledWith({
      where: { taskId },
    });
    expect(mockPrisma.taskTag.createMany).toHaveBeenCalledWith({
      data: [
        { taskId, tagId: 'tag-a' },
        { taskId, tagId: 'tag-b' },
      ],
      skipDuplicates: true,
    });
  });

  it('should clear all tags when tagIds is an empty array', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(existingTask);
    mockPrisma.task.update.mockResolvedValue({ ...existingTask, tags: [] });

    await service.update(userId, taskId, { tagIds: [] });

    expect(mockPrisma.taskTag.deleteMany).toHaveBeenCalledWith({
      where: { taskId },
    });
    expect(mockPrisma.taskTag.createMany).not.toHaveBeenCalled();
  });

  it('should replace existing tags when tagIds changes', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(existingTask);
    mockPrisma.task.update.mockResolvedValue({ ...existingTask, tags: [] });
    // Simulate going from [tag-a] to [tag-c]
    await service.update(userId, taskId, { tagIds: ['tag-c'] });

    expect(mockPrisma.taskTag.deleteMany).toHaveBeenCalledWith({
      where: { taskId },
    });
    expect(mockPrisma.taskTag.createMany).toHaveBeenCalledWith({
      data: [{ taskId, tagId: 'tag-c' }],
      skipDuplicates: true,
    });
  });

  it('should not touch tags when tagIds is undefined', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(existingTask);
    mockPrisma.task.update.mockResolvedValue({ ...existingTask, tags: [] });

    await service.update(userId, taskId, { title: 'New Title' });

    expect(mockPrisma.taskTag.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.taskTag.createMany).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when task does not exist', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.update(userId, taskId, { tagIds: ['tag-a'] }),
    ).rejects.toThrow(NotFoundException);
  });
});