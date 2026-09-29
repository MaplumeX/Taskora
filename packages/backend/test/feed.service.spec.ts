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
      user: { findUnique: vi.fn().mockResolvedValue({ preferences: { timeZone: 'UTC' } }) },
      task: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        groupBy: vi.fn(),
      },
      project: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        groupBy: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)),
    } as unknown as InstanceType<typeof PrismaService>;

    // 只测读路径；清空 Trash 的写路径见 rest-writes.structure.e2e-spec
    service = new FeedService(mockPrisma, undefined as never);
  });

  describe('findAll — project 排除（origin/main #41）', () => {
    const userId = 'user-1';

    it('anytime 视图不查询 projects（项目不出现在 Anytime）', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.task.groupBy.mockResolvedValue([]);
      await service.findAll(userId, 'anytime');
      expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
    });

    it('inbox 视图不查询 projects（项目不出现在收件箱）', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.task.groupBy.mockResolvedValue([]);
      await service.findAll(userId, 'inbox');
      expect(mockPrisma.project.findMany).not.toHaveBeenCalled();
    });

    it('today 视图仍查询 projects', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.groupBy.mockResolvedValue([]);
      mockPrisma.project.groupBy.mockResolvedValue([]);
      await service.findAll(userId, 'today');
      expect(mockPrisma.project.findMany).toHaveBeenCalledTimes(1);
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
      // 第一次：视图任务；第二次：进度计数用的项目任务
      mockPrisma.task.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { projectId: 'p1', status: TaskStatus.ACTIVE, trashedAt: null },
        { projectId: 'p1', status: TaskStatus.COMPLETED, trashedAt: null },
        { projectId: 'p1', status: TaskStatus.CANCELLED, trashedAt: null },
      ]);
      mockPrisma.project.findMany.mockResolvedValue([
        {
          id: 'p1',
          title: 'Project',
          notes: null,
          scheduledDate: new Date('2020-01-01T00:00Z'),
          scheduledType: 'DATE',
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

      const result = await service.findAll(userId, 'today');

      expect(result[0]).toMatchObject({
        id: 'p1',
        type: 'project',
        taskTotalCount: 3,
        taskCompletedCount: 2,
      });
    });
  });
});
