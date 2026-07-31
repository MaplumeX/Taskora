import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduledType, TaskBucket } from '@taskora/shared';

import type { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

describe('TasksService heading membership invariant', () => {
  const existing = {
    id: 'task-1',
    title: 'Task',
    notes: null,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    bucket: TaskBucket.ANYTIME,
    projectId: 'project-1',
    headingId: 'heading-1',
    areaId: null,
  };

  let prisma: {
    task: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: TasksService;

  beforeEach(() => {
    prisma = {
      task: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockImplementation(({ data }) => ({
          ...existing,
          ...data,
          tags: [],
        })),
      },
    };
    service = new TasksService(prisma as unknown as PrismaService);
  });

  it('clears heading membership when a task moves to another project', async () => {
    await service.update('user-1', 'task-1', { projectId: 'project-2' });

    expect(prisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          project: { connect: { id: 'project-2' } },
          heading: { disconnect: true },
        }),
      }),
    );
  });

  it('preserves heading membership for unrelated updates', async () => {
    await service.update('user-1', 'task-1', { title: 'Renamed' });

    const call = prisma.task.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('heading');
  });
});
