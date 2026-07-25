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
      },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new AreasService(mockPrisma);
  });

  describe('create', () => {
    it('should create a new area', async () => {
      const userId = 'user-1';
      const dto = { title: 'Work', notes: 'Work area' };
      const expected = {
        id: 'area-1',
        title: 'Work',
        notes: 'Work area',
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.area.create.mockResolvedValue(expected);

      const result = await service.create(userId, dto);

      expect(mockPrisma.area.create).toHaveBeenCalledWith({
        data: { title: 'Work', notes: 'Work area', userId },
      });
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should return all areas for a user', async () => {
      const userId = 'user-1';
      const expected = [
        { id: 'area-1', title: 'Work', notes: null, userId },
        { id: 'area-2', title: 'Personal', notes: null, userId },
      ];
      mockPrisma.area.findMany.mockResolvedValue(expected);

      const result = await service.findAll(userId);

      expect(mockPrisma.area.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
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
});