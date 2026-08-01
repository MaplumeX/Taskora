import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TaskBucket,
  TaskStatus,
  ScheduledType,
} from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('TasksService — convertToProject (subtask promotion)', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';
  const taskId = 'task-1';

  const existingTask = {
    id: taskId,
    title: 'Parent task',
    notes: 'some notes',
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
    tags: [],
    subtasks: [],
    project: null,
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        findFirst: vi.fn(),
        delete: vi.fn(),
        createMany: vi.fn(),
      },
      project: {
        aggregate: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(
        async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma),
      ),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  it('throws NotFoundException when task does not exist', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null);

    await expect(service.convertToProject(userId, 'nonexistent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates new tasks from subtasks and hard-deletes the original task', async () => {
    const subtasks = [
      {
        id: 'st-1',
        title: 'Subtask A',
        status: TaskStatus.ACTIVE,
        completedAt: null,
        sortOrder: 0,
        taskId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'st-2',
        title: 'Subtask B',
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
        sortOrder: 1,
        taskId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockPrisma.task.findFirst.mockResolvedValue({
      ...existingTask,
      subtasks,
    });
    mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: 5 } });
    const newProject = {
      id: 'proj-new',
      title: existingTask.title,
      tags: [],
    };
    mockPrisma.project.create.mockResolvedValue(newProject);
    mockPrisma.task.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.task.delete.mockResolvedValue(existingTask);

    const result = await service.convertToProject(userId, taskId);

    // New project created with next sortOrder
    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Parent task',
          sortOrder: 6,
          userId,
        }),
      }),
    );

    // Subtasks promoted to tasks under the new project
    expect(mockPrisma.task.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          title: 'Subtask A',
          status: TaskStatus.ACTIVE,
          completedAt: null,
          projectId: 'proj-new',
          bucket: TaskBucket.INBOX,
          scheduledType: ScheduledType.NONE,
        }),
        expect.objectContaining({
          title: 'Subtask B',
          status: TaskStatus.COMPLETED,
          projectId: 'proj-new',
          bucket: TaskBucket.INBOX,
          scheduledType: ScheduledType.NONE,
        }),
      ],
    });

    // Original task hard-deleted (triggers Subtask CASCADE)
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: taskId } });

    // Returns the new project with resolved tags
    expect(result.id).toBe('proj-new');
    expect(result.tags).toEqual([]);
  });

  it('does not call createMany when task has no subtasks', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({
      ...existingTask,
      subtasks: [],
    });
    mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockPrisma.project.create.mockResolvedValue({
      id: 'proj-new',
      title: existingTask.title,
      tags: [],
    });
    mockPrisma.task.delete.mockResolvedValue(existingTask);

    await service.convertToProject(userId, taskId);

    expect(mockPrisma.task.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: taskId } });
  });
});
