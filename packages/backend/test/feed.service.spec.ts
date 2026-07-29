import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { FeedService } from '../src/feed/feed.service';
import { TaskStatus, ProjectStatus } from '@taskora/shared';

describe('FeedService', () => {
  let service: FeedService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      task: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
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

    it('2. 仅 trashed task 无子任务 → 删该 task, count=1', async () => {
      const trashedTask = { id: 't1', parentId: null, projectId: null, status: TaskStatus.TRASHED };
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

    it('3. trashed task 有 active 子任务(B 级联) → 父子都删, count=2', async () => {
      const tasks = [
        { id: 't1', parentId: null, projectId: null, status: TaskStatus.TRASHED },
        { id: 't2', parentId: 't1', projectId: null, status: TaskStatus.ACTIVE },
      ];
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue(tasks);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.emptyTrash(userId);

      expect(result).toEqual({ deletedTasks: 2, deletedProjects: 0 });
      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: expect.arrayContaining(['t1', 't2']) }, userId },
      });
      const call = mockPrisma.task.deleteMany.mock.calls[0][0];
      expect(call.where.id.in).toHaveLength(2);
    });

    it('4. 多层级联后代 → 全部删', async () => {
      // t1 (trashed) → t2 (active) → t3 (completed) → t4 (active)
      const tasks = [
        { id: 't1', parentId: null, projectId: null, status: TaskStatus.TRASHED },
        { id: 't2', parentId: 't1', projectId: null, status: TaskStatus.ACTIVE },
        { id: 't3', parentId: 't2', projectId: null, status: TaskStatus.COMPLETED },
        { id: 't4', parentId: 't3', projectId: null, status: TaskStatus.ACTIVE },
      ];
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue(tasks);
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 4 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.emptyTrash(userId);

      expect(result).toEqual({ deletedTasks: 4, deletedProjects: 0 });
      const call = mockPrisma.task.deleteMany.mock.calls[0][0];
      expect(call.where.id.in).toHaveLength(4);
      expect(call.where.id.in).toEqual(expect.arrayContaining(['t1', 't2', 't3', 't4']));
    });

    it('5. trashed project + 下属 active task(B\' 级联) → project + task 都删', async () => {
      const tasks = [
        { id: 't1', parentId: null, projectId: 'p1', status: TaskStatus.ACTIVE },
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

    it('6. 非 trashed task 不被删(status 隔离)', async () => {
      // active task 无父、不属 trashed project → 不应出现在删除集
      const tasks = [
        { id: 't1', parentId: null, projectId: null, status: TaskStatus.TRASHED },
        { id: 't2', parentId: null, projectId: null, status: TaskStatus.ACTIVE },
        { id: 't3', parentId: null, projectId: null, status: TaskStatus.COMPLETED },
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
        where: { userId, status: ProjectStatus.TRASHED },
        select: { id: true },
      });
      // task.findMany where 含 userId
      expect(mockPrisma.task.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { id: true, parentId: true, projectId: true, status: true },
      });
      // deleteMany where 含 userId(双保险)
      const taskCall = mockPrisma.task.deleteMany.mock.calls[0][0];
      expect(taskCall.where).toHaveProperty('userId', userId);
      const projectCall = mockPrisma.project.deleteMany.mock.calls[0][0];
      expect(projectCall.where).toHaveProperty('userId', userId);
    });
  });
});
