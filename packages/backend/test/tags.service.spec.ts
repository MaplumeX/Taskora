import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/prisma/prisma.service';
import { TagsService } from '../src/tags/tags.service';

describe('TagsService', () => {
  let service: TagsService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  beforeEach(() => {
    mockPrisma = {
      tag: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      compactedEntity: { createMany: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma)),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TagsService(mockPrisma, undefined as never); // 只测读路径;
  });

  describe('findAll', () => {
    it('should return all tags for a user', async () => {
      const userId = 'user-1';
      const expected = [
        { id: 'tag-1', title: 'Urgent', color: '#3B82F6', userId, position: 'a0' },
        { id: 'tag-2', title: 'Low', color: '#10B981', userId, position: 'a1' },
      ];
      mockPrisma.tag.findMany.mockResolvedValue([expected[1], expected[0]]);

      const result = await service.findAll(userId);

      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({ where: { userId } });
      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('should return a tag by id', async () => {
      const userId = 'user-1';
      const expected = {
        id: 'tag-1',
        title: 'Urgent',
        color: '#3B82F6',
        userId,
      };
      mockPrisma.tag.findFirst.mockResolvedValue(expected);

      const result = await service.findOne(userId, 'tag-1');

      expect(mockPrisma.tag.findFirst).toHaveBeenCalledWith({
        where: { id: 'tag-1', userId },
      });
      expect(result).toEqual(expected);
    });

    it('should throw NotFoundException when tag does not exist', async () => {
      mockPrisma.tag.findFirst.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
