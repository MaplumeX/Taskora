import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';
import { TaskBucket, TaskStatus, ScheduledType } from '@taskora/shared';

describe('TasksService create() tagIds support', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';

  const baseCreatedTask = {
    id: 'task-1',
    title: 'Task',
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
    parentId: null,
    projectId: null,
    areaId: null,
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        create: vi.fn(),
      },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  it('should create nested TaskTag associations when tagIds is a non-empty array', async () => {
    const tagA = { id: 'tag-a', title: 'A', color: '#fff' };
    const tagB = { id: 'tag-b', title: 'B', color: '#000' };
    mockPrisma.task.create.mockResolvedValue({
      ...baseCreatedTask,
      tags: [
        { tag: tagA },
        { tag: tagB },
      ],
    });

    const result = await service.create(userId, {
      title: 'Task',
      tagIds: ['tag-a', 'tag-b'],
    });

    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: {
        title: 'Task',
        notes: undefined,
        scheduledDate: null,
        scheduledType: ScheduledType.NONE,
        dueDate: null,
        bucket: TaskBucket.INBOX,
        userId,
        parentId: undefined,
        projectId: undefined,
        areaId: undefined,
        tags: { create: [{ tagId: 'tag-a' }, { tagId: 'tag-b' }] },
      },
      include: { tags: { include: { tag: true } } },
    });
    expect(result.tags).toEqual([tagA, tagB]);
  });

  it('should not include tags nested create when tagIds is empty or undefined', async () => {
    mockPrisma.task.create.mockResolvedValue({ ...baseCreatedTask, tags: [] });

    const result = await service.create(userId, { title: 'Task' });

    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: {
        title: 'Task',
        notes: undefined,
        scheduledDate: null,
        scheduledType: ScheduledType.NONE,
        dueDate: null,
        bucket: TaskBucket.INBOX,
        userId,
        parentId: undefined,
        projectId: undefined,
        areaId: undefined,
      },
      include: { tags: { include: { tag: true } } },
    });
    expect(result.tags).toEqual([]);
  });

  it('should resolve bucket=ANYTIME when bucket is explicitly provided', async () => {
    mockPrisma.task.create.mockResolvedValue({
      ...baseCreatedTask,
      bucket: TaskBucket.ANYTIME,
      tags: [],
    });

    await service.create(userId, {
      title: 'Task',
      bucket: TaskBucket.ANYTIME,
    });

    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bucket: TaskBucket.ANYTIME,
        }),
      }),
    );
  });

  it('should resolve bucket=ANYTIME when areaId is provided', async () => {
    mockPrisma.task.create.mockResolvedValue({
      ...baseCreatedTask,
      bucket: TaskBucket.ANYTIME,
      areaId: 'area-1',
      tags: [],
    });

    await service.create(userId, {
      title: 'Task',
      areaId: 'area-1',
    });

    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bucket: TaskBucket.ANYTIME,
          areaId: 'area-1',
        }),
      }),
    );
  });
});
