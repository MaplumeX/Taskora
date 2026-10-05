import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectsService } from '../src/projects/projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ preferences: { timeZone: 'UTC' } }) },
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
        findMany: vi.fn().mockResolvedValue([]),
      },
      projectTag: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      $transaction: vi.fn((promises: unknown[]) => Promise.all(promises)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new ProjectsService(mockPrisma, undefined as never); // 只测读路径;
  });

  describe('findAll', () => {
    it('should return all non-trashed projects ordered by Position', async () => {
      const userId = 'user-1';
      const expected = [
        {
          id: 'project-1',
          title: 'A',
          notes: null,
          userId,
          position: 'a0',
          repeatRule: null,
          tags: [],
        },
        {
          id: 'project-2',
          title: 'B',
          notes: null,
          userId,
          position: 'a1',
          repeatRule: null,
          tags: [],
        },
      ];
      mockPrisma.project.findMany.mockResolvedValue([expected[1], expected[0]]);
      // 进度计数：非 Trash 任务总数 / 已了结（完成 + 取消）数
      mockPrisma.task.findMany.mockResolvedValue([
        ...Array.from({ length: 2 }, () => ({
          projectId: 'project-1',
          status: 'ACTIVE',
          trashedAt: null,
        })),
        { projectId: 'project-1', status: 'COMPLETED', trashedAt: null },
        { projectId: 'project-1', status: 'COMPLETED', trashedAt: null },
        { projectId: 'project-1', status: 'CANCELLED', trashedAt: null },
      ]);

      const result = await service.findAll(userId);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { userId, trashedAt: null },
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
      const expected = {
        id: projectId,
        title: 'Taskora',
        notes: null,
        userId,
        repeatRule: null,
        tags: [],
        taskTotalCount: 5,
        taskCompletedCount: 2,
      };
      mockPrisma.project.findFirst.mockResolvedValue({
        id: projectId,
        title: 'Taskora',
        notes: null,
        userId,
        tags: [],
      });
      mockPrisma.task.findMany.mockResolvedValue([
        ...Array.from({ length: 3 }, () => ({ projectId, status: 'ACTIVE', trashedAt: null })),
        { projectId, status: 'COMPLETED', trashedAt: null },
        { projectId, status: 'CANCELLED', trashedAt: null },
      ]);

      const result = await service.findOne(userId, projectId);

      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: projectId, userId },
        include: { tags: { include: { tag: true } } },
      });
      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException when project does not exist', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
