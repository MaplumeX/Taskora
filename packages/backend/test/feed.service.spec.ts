import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { FeedService } from '../src/feed/feed.service';
import { TaskStatus } from '@taskora/shared';

// Note: trashedAt is the sole deletion indicator now; status no longer has TRASHED.
// Subtask rows CASCADE automatically when parent Task is physically deleted;
// no parentId BFS is needed.

describe('FeedService', () => {
  let service: FeedService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      task: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        groupBy: vi.fn(),
      },
      project: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new FeedService(mockPrisma);
  });

  describe('emptyTrash', () => {
    const userId = 'user-1';

    it('1. 空 trash: 无 trashed task / project → deleteMany 不调用, count=0', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.emptyTrash(userId);

      expect(result).toEqual({ deletedTasks: 0, deletedProjects: 0 });
      // deleteMany 应以空 in 列表调用(集合为空 → in: [])
      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [] }, userId },
      });
      expect(mockPrisma.project.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [] }, userId },
      });
    });

    it('2. 仅 trashed task → 删该 task, count=1', async () => {
      const trashedTask = { id: 't1', projectId: null, trashedAt: new Date(), status: TaskStatus.ACTIVE };
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([trashedTask]);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.emptyTrash(userId);

      expect(result).toEqual({ deletedTasks: 1, deletedProjects: 0 });
      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] }, userId },
      });
    });

    it('5. trashed project + 下属 active task → project + task 都删', async () => {
      const tasks = [
        { id: 't1', projectId: 'p1', trashedAt: null, status: TaskStatus.ACTIVE },
      ];
      mockPrisma.project.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.task.findMany.mockResolvedValue(tasks);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.emptyTrash(userId);

      expect(result).toEqual({ deletedTasks: 1, deletedProjects: 1 });
      // task 删除集合应含 t1(project 下属)
      const taskCall = mockPrisma.task.deleteMany.mock.calls[0][0];
      expect(taskCall.where.id.in).toEqual(['t1']);
      // project 删除集合应含 p1
      expect(mockPrisma.project.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['p1'] }, userId },
      });
    });

    it('6. 非 trashed task 不被删(trashedAt 隔离)', async () => {
      // active task 不属 trashed project → 不应出现在删除集
      const tasks = [
        { id: 't1', projectId: null, trashedAt: new Date(), status: TaskStatus.ACTIVE },
        { id: 't2', projectId: null, trashedAt: null, status: TaskStatus.ACTIVE },
        { id: 't3', projectId: null, trashedAt: null, status: TaskStatus.COMPLETED },
      ];
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue(tasks);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.emptyTrash(userId);

      expect(result).toEqual({ deletedTasks: 1, deletedProjects: 0 });
      const call = mockPrisma.task.deleteMany.mock.calls[0][0];
      expect(call.where.id.in).toEqual(['t1']);
    });

    it('7. userId 隔离: findMany where 含 userId, deleteMany where 含 userId', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });

      await service.emptyTrash(userId);

      // project.findMany where 含 userId
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { userId, trashedAt: { not: null } },
        select: { id: true },
      });
      // task.findMany where 含 userId (no parentId select)
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { id: true, projectId: true, trashedAt: true },
      });
      // deleteMany where 含 userId(双保险)
      const taskCall = mockPrisma.task.deleteMany.mock.calls[0][0];
      expect(taskCall.where).toHaveProperty('userId', userId);
      const projectCall = mockPrisma.project.deleteMany.mock.calls[0][0];
      expect(projectCall.where).toHaveProperty('userId', userId);
    });
  });

  describe('findAll — logbook view（spec: task-cancelled）', () => {
    const userId = 'user-1';

    const taskRow = (overrides: Record<string, unknown>) => ({
      id: 'task-1',
      type: undefined,
      title: 'Task',
      notes: null,
      scheduledDate: null,
      scheduledType: 'NONE',
      dueDate: null,
      bucket: 'INBOX',
      trashedAt: null,
      sortOrder: 0,
      projectId: null,
      headingId: null,
      areaId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      tags: [],
      ...overrides,
    });

    it('logbook 查询含完成与取消任务，按 settledAt 排序', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        taskRow({
          id: 'task-1',
          status: TaskStatus.COMPLETED,
          settledAt: new Date('2026-09-18T10:00:00Z'),
        }),
        taskRow({
          id: 'task-2',
          status: TaskStatus.CANCELLED,
          settledAt: new Date('2026-09-19T10:00:00Z'),
        }),
      ]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.groupBy.mockResolvedValue([]);

      const result = await service.findAll(userId, 'logbook');

      const taskCall = mockPrisma.task.findMany.mock.calls[0][0];
      expect(taskCall.where).toEqual(
        expect.objectContaining({
          userId,
          status: { in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
          trashedAt: null,
        }),
      );
      expect(taskCall.orderBy).toEqual([{ settledAt: 'desc' }]);
      expect(result).toHaveLength(2);
      // 按了结时间降序（取消的更晚 → 在前）
      expect(result[0]).toMatchObject({ id: 'task-2' });
      expect(result[1]).toMatchObject({ id: 'task-1' });
    });

    it('settledAt 以下发字段 completedAt 承载', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        taskRow({
          status: TaskStatus.CANCELLED,
          settledAt: new Date('2026-09-19T10:00:00Z'),
        }),
      ]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.groupBy.mockResolvedValue([]);

      const [item] = await service.findAll(userId, 'logbook');

      expect(item.type).toBe('task');
      expect(item.completedAt).toBe('2026-09-19T10:00:00.000Z');
    });

    it('项目统计的 completed 计数口径 = 已了结（完成 + 取消）', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          title: 'Project',
          notes: null,
          scheduledDate: null,
          scheduledType: 'NONE',
          dueDate: null,
          status: 'ACTIVE',
          bucket: 'ANYTIME',
          completedAt: null,
          trashedAt: null,
          sortOrder: 0,
          areaId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: [],
        },
      ]);
      mockPrisma.task.groupBy
        .mockResolvedValueOnce([{ projectId: 'p1', _count: { _all: 3 } }])
        .mockResolvedValueOnce([{ projectId: 'p1', _count: { _all: 2 } }]);

      const result = await service.findAll(userId, 'anytime');

      const completedCall = mockPrisma.task.groupBy.mock.calls[1][0];
      expect(completedCall.where.status).toEqual({
        in: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
      });
      expect(result[0]).toMatchObject({
        id: 'p1',
        type: 'project',
        taskTotalCount: 3,
        taskCompletedCount: 2,
      });
    });
  });
});
