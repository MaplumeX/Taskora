import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { synthPosition } from '@taskora/engine';

import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectsService } from '../src/projects/projects.service';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      project: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        updateMany: vi.fn(),
        aggregate: vi.fn(),
      },
      task: {
        updateMany: vi.fn(),
        groupBy: vi.fn(),
        aggregate: vi.fn(),
      },
      projectTag: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      $transaction: vi.fn((promises: unknown[]) => Promise.all(promises)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new ProjectsService(mockPrisma);
  });

  describe('create', () => {
    it('should create a new project with sortOrder = max + 1', async () => {
      const userId = 'user-1';
      const dto = { title: 'Taskora', notes: 'Build app', areaId: 'area-1' };
      const expected = {
        id: 'project-1',
        title: 'Taskora',
        notes: 'Build app',
        areaId: 'area-1',
        sortOrder: 3,
        userId,
        status: ProjectStatus.ACTIVE,
        bucket: ProjectBucket.ANYTIME,
        scheduledType: ScheduledType.NONE,
        scheduledDate: null,
        dueDate: null,
        completedAt: null,
        trashedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
        taskTotalCount: 0,
        taskCompletedCount: 0,
      };
      mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      mockPrisma.project.create.mockResolvedValue({ ...expected, tags: [], taskTotalCount: undefined, taskCompletedCount: undefined });

      const result = await service.create(userId, dto);

      expect(mockPrisma.project.aggregate).toHaveBeenCalledWith({
        where: { userId },
        _max: { sortOrder: true },
      });
      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: {
          title: 'Taskora',
          notes: 'Build app',
          areaId: 'area-1',
          sortOrder: 3,
          userId,
          scheduledType: ScheduledType.NONE,
          scheduledDate: null,
          dueDate: null,
          bucket: ProjectBucket.ANYTIME,
        },
        include: { tags: { include: { tag: true } } },
      });
      expect(result).toEqual(expected);
    });

    it('should set sortOrder = 0 when no projects exist', async () => {
      const userId = 'user-1';
      const dto = { title: 'First Project' };
      const expected = {
        id: 'project-1',
        title: 'First Project',
        notes: null,
        areaId: null,
        sortOrder: 0,
        userId,
        status: ProjectStatus.ACTIVE,
        bucket: ProjectBucket.ANYTIME,
        scheduledType: ScheduledType.NONE,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
        taskTotalCount: 0,
        taskCompletedCount: 0,
      };
      mockPrisma.project.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrisma.project.create.mockResolvedValue({ ...expected, tags: [], taskTotalCount: undefined, taskCompletedCount: undefined });

      const result = await service.create(userId, dto);

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: {
          title: 'First Project',
          notes: undefined,
          areaId: undefined,
          sortOrder: 0,
          userId,
          scheduledType: ScheduledType.NONE,
          scheduledDate: null,
          dueDate: null,
          bucket: ProjectBucket.ANYTIME,
        },
        include: { tags: { include: { tag: true } } },
      });
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should return all non-trashed projects ordered by sortOrder asc, createdAt desc', async () => {
      const userId = 'user-1';
      const expected = [
        { id: 'project-1', title: 'A', notes: null, userId, sortOrder: 0, tags: [] },
        { id: 'project-2', title: 'B', notes: null, userId, sortOrder: 1, tags: [] },
      ];
      mockPrisma.project.findMany.mockResolvedValue(expected);
      mockPrisma.task.groupBy
        .mockResolvedValueOnce([
          { projectId: 'project-1', _count: { _all: 5 } },
          { projectId: 'project-2', _count: { _all: 0 } },
        ])
        .mockResolvedValueOnce([
          { projectId: 'project-1', _count: { _all: 3 } },
        ]);

      const result = await service.findAll(userId);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { userId, trashedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: { tags: { include: { tag: true } } },
      });
      expect(result).toEqual([
        { ...expected[0], taskTotalCount: 5, taskCompletedCount: 3 },
        { ...expected[1], taskTotalCount: 0, taskCompletedCount: 0 },
      ]);
    });
  });

  describe('findOne', () => {
    it('should return a project by id', async () => {
      const userId = 'user-1';
      const projectId = 'project-1';
      const expected = { id: projectId, title: 'Taskora', notes: null, userId, tags: [], taskTotalCount: 5, taskCompletedCount: 2 };
      mockPrisma.project.findFirst.mockResolvedValue({ id: projectId, title: 'Taskora', notes: null, userId, tags: [] });
      mockPrisma.task.aggregate
        .mockResolvedValueOnce({ _count: { _all: 5 } })
        .mockResolvedValueOnce({ _count: { _all: 2 } });

      const result = await service.findOne(userId, projectId);

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: projectId, userId },
        include: { tags: { include: { tag: true } } },
      });
      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException when project does not exist', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove (trash)', () => {
    it('should throw NotFoundException when project does not exist', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(service.remove('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trashes project and cascades to下属 tasks', async () => {
      const userId = 'user-1';
      const projectId = 'project-1';
      mockPrisma.project.findFirst.mockResolvedValue({ id: projectId, userId });
      mockPrisma.project.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.task.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.remove(userId, projectId);

      expect(result.trashedAt).toBeInstanceOf(Date);
      // project updateMany
      const projCall = mockPrisma.project.updateMany.mock.calls[0][0];
      expect(projCall.where).toEqual({ id: projectId, userId });
      expect(projCall.data.trashedAt).toBeInstanceOf(Date);
      expect(projCall.data).not.toHaveProperty('status');
      // task cascade updateMany
      const taskCall = mockPrisma.task.updateMany.mock.calls[0][0];
      expect(taskCall.where).toEqual({ projectId, userId });
      expect(taskCall.data.trashedAt).toBeInstanceOf(Date);
      expect(taskCall.data).not.toHaveProperty('status');
      expect(taskCall.data).not.toHaveProperty('headingId');
      // transaction used
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should throw NotFoundException when project does not exist', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(service.restore('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('restores project and cascades to下属 tasks（随级联进 Trash 的同时间戳任务）', async () => {
      const userId = 'user-1';
      const projectId = 'project-1';
      const cascadeTrashedAt = new Date('2026-01-01T00:00:00Z');
      mockPrisma.project.findFirst.mockResolvedValue({
        id: projectId,
        userId,
        trashedAt: cascadeTrashedAt,
      });
      mockPrisma.project.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.task.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.restore(userId, projectId);

      expect(result.trashedAt).toBeNull();
      const projCall = mockPrisma.project.updateMany.mock.calls[0][0];
      expect(projCall.where).toEqual({ id: projectId, userId });
      expect(projCall.data.trashedAt).toBeNull();
      expect(projCall.data).not.toHaveProperty('status');
      const taskCall = mockPrisma.task.updateMany.mock.calls[0][0];
      // 只捡回级联时间戳相同的任务；单独删掉（不同 trashedAt）的保持原状
      expect(taskCall.where).toEqual({
        projectId,
        userId,
        trashedAt: cascadeTrashedAt,
      });
      expect(taskCall.data.trashedAt).toBeNull();
      expect(taskCall.data).not.toHaveProperty('status');
      expect(taskCall.data).not.toHaveProperty('headingId');
    });
  });

  describe('reorder', () => {
    it('should update sortOrder and position for all orderedIds in a transaction', async () => {
      const userId = 'user-1';
      const orderedIds = ['project-1', 'project-2', 'project-3'];
      const created = [
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-02T00:00:00Z'),
        new Date('2026-01-03T00:00:00Z'),
      ];
      mockPrisma.project.findMany.mockResolvedValue(
        orderedIds.map((id, i) => ({ id, createdAt: created[i] })),
      );
      mockPrisma.project.updateMany.mockResolvedValue({ count: 1 });

      await service.reorder(userId, orderedIds);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { id: { in: orderedIds }, userId },
        select: { id: true, createdAt: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.project.updateMany).toHaveBeenCalledTimes(3);
      // position 写入值与 hub 的 legacy 合成函数一致（synthPosition），
      // 保证桌面端 Local Replica 与 web 端 sortOrder 序列不漂移。
      expect(mockPrisma.project.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'project-1', userId },
        data: { sortOrder: 0, position: synthPosition(0, created[0]) },
      });
      expect(mockPrisma.project.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'project-2', userId },
        data: { sortOrder: 1, position: synthPosition(1, created[1]) },
      });
      expect(mockPrisma.project.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'project-3', userId },
        data: { sortOrder: 2, position: synthPosition(2, created[2]) },
      });
    });

    it('should throw NotFoundException when an id is not owned by the user', async () => {
      const userId = 'user-1';
      const orderedIds = ['project-1', 'foreign-project'];
      mockPrisma.project.findMany.mockResolvedValue([{ id: 'project-1' }]);

      await expect(service.reorder(userId, orderedIds)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when an id does not exist', async () => {
      const userId = 'user-1';
      const orderedIds = ['project-1', 'nonexistent'];
      mockPrisma.project.findMany.mockResolvedValue([{ id: 'project-1' }]);

      await expect(service.reorder(userId, orderedIds)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
