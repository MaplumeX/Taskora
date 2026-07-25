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
      $transaction: vi.fn((promises: unknown[]) => Promise.all(promises)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new AreasService(mockPrisma);
  });

  describe('create', () => {
    it('should create a new area with sortOrder = max + 1', async () => {
      const userId = 'user-1';
      const dto = { title: 'Work', notes: 'Work area' };
      const expected = {
        id: 'area-1',
        title: 'Work',
        notes: 'Work area',
        sortOrder: 5,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.area.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      mockPrisma.area.create.mockResolvedValue(expected);

      const result = await service.create(userId, dto);

      expect(mockPrisma.area.aggregate).toHaveBeenCalledWith({
        where: { userId },
        _max: { sortOrder: true },
      });
      expect(mockPrisma.area.create).toHaveBeenCalledWith({
        data: { title: 'Work', notes: 'Work area', sortOrder: 5, userId },
      });
      expect(result).toEqual(expected);
    });

    it('should set sortOrder = 0 when no areas exist', async () => {
      const userId = 'user-1';
      const dto = { title: 'Work' };
      const expected = {
        id: 'area-1',
        title: 'Work',
        notes: null,
        sortOrder: 0,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.area.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      mockPrisma.area.create.mockResolvedValue(expected);

      const result = await service.create(userId, dto);

      expect(mockPrisma.area.create).toHaveBeenCalledWith({
        data: { title: 'Work', notes: undefined, sortOrder: 0, userId },
      });
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should return all areas for a user ordered by sortOrder asc, createdAt desc', async () => {
      const userId = 'user-1';
      const expected = [
        { id: 'area-1', title: 'Work', notes: null, userId, sortOrder: 0 },
        { id: 'area-2', title: 'Personal', notes: null, userId, sortOrder: 1 },
      ];
      mockPrisma.area.findMany.mockResolvedValue(expected);

      const result = await service.findAll(userId);

      expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('should return an area by id', async () => {
      const userId = 'user-1';
      const areaId = 'area-1';
      const expected = { id: areaId, title: 'Work', notes: null, userId };
      mockPrisma.area.findFirst.mockResolvedValue(expected);

      const result = await service.findOne(userId, areaId);

      expect(mockPrisma.area.findFirst).toHaveBeenCalledWith({
        where: { id: areaId, userId },
      });
      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException when area does not exist', async () => {
      mockPrisma.area.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update an area after verifying it exists', async () => {
      const userId = 'user-1';
      const areaId = 'area-1';
      const existing = { id: areaId, title: 'Work', notes: null, userId };
      const updated = { ...existing, title: 'Work Updated' };
      mockPrisma.area.findFirst.mockResolvedValue(existing);
      mockPrisma.area.update.mockResolvedValue(updated);

      const result = await service.update(userId, areaId, {
        title: 'Work Updated',
        notes: undefined,
      });

      expect(mockPrisma.area.update).toHaveBeenCalledWith({
        where: { id: areaId },
        data: { title: 'Work Updated', notes: undefined },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delete an area after verifying it exists', async () => {
      const userId = 'user-1';
      const areaId = 'area-1';
      const existing = { id: areaId, title: 'Work', notes: null, userId };
      mockPrisma.area.findFirst.mockResolvedValue(existing);
      mockPrisma.area.delete.mockResolvedValue(existing);

      const result = await service.remove(userId, areaId);

      expect(mockPrisma.area.delete).toHaveBeenCalledWith({
        where: { id: areaId },
      });
      expect(result).toEqual(existing);
    });
  });

  describe('reorder', () => {
    it('should update sortOrder for all orderedIds in a transaction', async () => {
      const userId = 'user-1';
      const orderedIds = ['area-1', 'area-2', 'area-3'];
      mockPrisma.area.findMany.mockResolvedValue([
        { id: 'area-1' },
        { id: 'area-2' },
        { id: 'area-3' },
      ]);
      mockPrisma.area.updateMany.mockResolvedValue({ count: 1 });

      await service.reorder(userId, orderedIds);

      expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
        where: { id: { in: orderedIds }, userId },
        select: { id: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.area.updateMany).toHaveBeenCalledTimes(3);
      expect(mockPrisma.area.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'area-1', userId },
        data: { sortOrder: 0 },
      });
      expect(mockPrisma.area.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 'area-2', userId },
        data: { sortOrder: 1 },
      });
      expect(mockPrisma.area.updateMany).toHaveBeenNthCalledWith(3, {
        where: { id: 'area-3', userId },
        data: { sortOrder: 2 },
      });
    });

    it('should throw NotFoundException when an id is not owned by the user', async () => {
      const userId = 'user-1';
      const orderedIds = ['area-1', 'foreign-area'];
      mockPrisma.area.findMany.mockResolvedValue([{ id: 'area-1' }]);

      await expect(service.reorder(userId, orderedIds)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when an id does not exist', async () => {
      const userId = 'user-1';
      const orderedIds = ['area-1', 'nonexistent'];
      mockPrisma.area.findMany.mockResolvedValue([{ id: 'area-1' }]);

      await expect(service.reorder(userId, orderedIds)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});