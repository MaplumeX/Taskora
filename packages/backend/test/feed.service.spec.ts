import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { FeedService } from '../src/feed/feed.service';
import { formatHlc } from '@taskora/engine';
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

    it('anytime 视图不返回项目行，项目查询仅用于判定稍后项目', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.groupBy.mockResolvedValue([]);
      const result = await service.findAll(userId, 'anytime');
      expect(result).toEqual([]);
      expect(mockPrisma.project.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.project.findMany.mock.calls[0][0].select).toEqual(
        expect.objectContaining({ id: true, scheduledType: true }),
      );
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

  describe('findAll — Today 收录截止日期已到的条目', () => {
    it('只有截止日期的任务进 Today，并带出截止日期的写入时刻（New in Today）', async () => {
      const setAt = Date.parse('2026-01-01T08:00:00.000Z');
      mockPrisma.task.findMany.mockResolvedValue([
        {
          id: 'due',
          title: 'due',
          notes: null,
          scheduledDate: null,
          scheduledType: 'NONE',
          dueDate: new Date('2026-01-02T00:00:00Z'),
          status: TaskStatus.ACTIVE,
          bucket: 'INBOX',
          settledAt: null,
          trashedAt: null,
          projectId: null,
          headingId: null,
          areaId: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          fieldClocks: { dueDate: formatHlc({ wallMs: setAt, counter: 0, deviceId: 'd' }) },
          tags: [],
        },
      ]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.groupBy.mockResolvedValue([]);

      const [item] = await service.findAll('user-1', 'today');

      expect(item.id).toBe('due');
      expect(item.dueSetAt).toBe('2026-01-01T08:00:00.000Z');
      expect(item.scheduledSetAt).toBeNull();
    });
  });

  describe('findAll — 稍后项目内的任务（spec: later-projects）', () => {
    const userId = 'user-1';
    const project = (id: string, scheduledType: string, scheduledDate: Date | null = null) => ({
      id,
      status: 'ACTIVE',
      trashedAt: null,
      scheduledType,
      scheduledDate,
    });
    const row = (id: string, projectId: string | null, scheduledType = 'NONE') => ({
      id,
      title: id,
      notes: null,
      scheduledDate: null,
      scheduledType,
      dueDate: null,
      status: TaskStatus.ACTIVE,
      bucket: 'ANYTIME',
      settledAt: null,
      trashedAt: null,
      projectId,
      headingId: null,
      areaId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      tags: [],
    });
    const candidates = [
      project('p-someday', 'SOMEDAY'),
      project('p-future', 'DATE', new Date('2099-01-01T00:00:00Z')),
      project('p-past', 'DATE', new Date('2020-01-01T00:00:00Z')),
    ];

    it('anytime 排除 Someday / 未来日期项目内的任务，保留日期已到项目与无项目任务', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        row('loose', null),
        row('in-someday', 'p-someday'),
        row('in-future', 'p-future'),
        row('in-past', 'p-past'),
        row('in-active', 'p-active'),
      ]);
      mockPrisma.project.findMany.mockResolvedValue(candidates);
      mockPrisma.task.groupBy.mockResolvedValue([]);

      const result = await service.findAll(userId, 'anytime');

      // 排序由 domain sortFeedItems 决定，这里只断言可见集合
      expect(result.map((item) => item.id).sort()).toEqual(['in-active', 'in-past', 'loose']);
    });

    it('someday 排除 Someday 项目内的 Someday 任务', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        row('loose', null, 'SOMEDAY'),
        row('in-someday', 'p-someday', 'SOMEDAY'),
      ]);
      // 第一次：someday 视图的项目行；第二次：稍后项目候选
      mockPrisma.project.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(candidates);
      mockPrisma.task.groupBy.mockResolvedValue([]);
      mockPrisma.project.groupBy.mockResolvedValue([]);

      const result = await service.findAll(userId, 'someday');

      expect(result.map((item) => item.id)).toEqual(['loose']);
    });

    it('today 不判定稍后项目：有日期的任务照常出现', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.groupBy.mockResolvedValue([]);
      mockPrisma.project.groupBy.mockResolvedValue([]);

      await service.findAll(userId, 'today');

      // 只有 today 视图自身的项目行查询
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

  describe('reorder — feed 混排（feed-project-ordering spec）', () => {
    it('项目行写 feedPosition、任务写 position，只写必须移动的行', async () => {
      const writes: Array<[string, string, Record<string, unknown>]> = [];
      const hub = {
        writeAsHub: vi.fn(async (_userId: string, fn: (batch: unknown) => Promise<void>) =>
          fn({
            write: async (entity: string, id: string, fields: Record<string, unknown>) => {
              writes.push([entity, id, fields]);
            },
          }),
        ),
      };
      const writing = new FeedService(mockPrisma, hub as never);
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 't1', position: 'a1' },
        { id: 't2', position: 'a2' },
      ]);
      mockPrisma.project.findMany.mockResolvedValue([
        { id: 'p', position: 'a5', feedPosition: null },
      ]);

      await writing.reorder('user-1', [
        { type: 'task', id: 't1' },
        { type: 'project', id: 'p' },
        { type: 'task', id: 't2' },
      ]);

      expect(writes).toHaveLength(1);
      const [entity, id, fields] = writes[0];
      expect([entity, id, Object.keys(fields)]).toEqual(['project', 'p', ['feedPosition']]);
      expect('a1' < (fields.feedPosition as string) && (fields.feedPosition as string) < 'a2').toBe(
        true,
      );
    });

    it('顺序未变不写；不属于该用户的行报 404', async () => {
      const hub = { writeAsHub: vi.fn() };
      const writing = new FeedService(mockPrisma, hub as never);
      mockPrisma.task.findMany.mockResolvedValue([{ id: 't1', position: 'a1' }]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      await writing.reorder('user-1', [{ type: 'task', id: 't1' }]);
      expect(hub.writeAsHub).not.toHaveBeenCalled();

      mockPrisma.task.findMany.mockResolvedValue([]);
      await expect(writing.reorder('user-1', [{ type: 'task', id: 'other' }])).rejects.toThrow(
        'Feed item not found',
      );
    });
  });
});
