import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { AreasService } from '../src/areas/areas.service';

describe('AreasService', () => {
  let service: AreasService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      area: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        updateMany: vi.fn(),
        aggregate: vi.fn(),
      },
      areaTag: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      compactedEntity: { createMany: vi.fn() },
      $transaction: vi.fn((value: unknown) =>
        typeof value === 'function' ? value(mockPrisma) : Promise.all(value as Promise<unknown>[]),
      ),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new AreasService(mockPrisma, undefined as never); // 只测读路径;
  });

  describe('findAll', () => {
    it('should return all areas for a user ordered by Position', async () => {
      const userId = 'user-1';
      const work = {
        id: 'area-1',
        title: 'Work',
        notes: null,
        userId,
        position: 'a0',
        reviewInterval: null,
        tags: [],
      };
      const personal = {
        id: 'area-2',
        title: 'Personal',
        notes: null,
        userId,
        position: 'a1',
        reviewInterval: null,
        tags: [],
      };
      mockPrisma.area.findMany.mockResolvedValue([personal, work]);

      const result = await service.findAll(userId);

      expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: { tags: { include: { tag: true } } },
      });
      expect(result).toEqual([work, personal]);
    });

    it('should map tags from join table to tag array', async () => {
      const userId = 'user-1';
      const tag = {
        id: 'tag-1',
        title: 'Urgent',
        color: '#FF0000',
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.area.findMany.mockResolvedValue([
        { id: 'area-1', title: 'Work', notes: null, userId, tags: [{ tag }] },
      ]);

      const result = await service.findAll(userId);

      expect(result[0].tags).toEqual([tag]);
    });
  });

  describe('findOne', () => {
    it('should return an area by id', async () => {
      const userId = 'user-1';
      const areaId = 'area-1';
      const expected = {
        id: areaId,
        title: 'Work',
        notes: null,
        userId,
        reviewInterval: null,
        tags: [],
      };
      mockPrisma.area.findFirst.mockResolvedValue(expected);

      const result = await service.findOne(userId, areaId);

      expect(mockPrisma.area.findFirst).toHaveBeenCalledWith({
        where: { id: areaId, userId },
        include: { tags: { include: { tag: true } } },
      });
      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException when area does not exist', async () => {
      mockPrisma.area.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
