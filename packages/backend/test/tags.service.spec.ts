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
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TagsService(mockPrisma);
  });

  describe('create', () => {
    it('should create a tag with default color when color is not provided', async () => {
      const userId = 'user-1';
      const dto = { title: 'Urgent', tagGroupId: null };
      const expected = {
        id: 'tag-1',
        title: 'Urgent',
        color: '#3B82F6',
        sortOrder: 0,
        tagGroupId: null,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.tag.create.mockResolvedValue(expected);

      const result = await service.create(userId, dto);

      expect(mockPrisma.tag.create).toHaveBeenCalledWith({
        data: {
          title: 'Urgent',
          color: '#3B82F6',
          tagGroupId: null,
          userId,
        },
      });
      expect(result).toEqual(expected);
    });

    it('should use provided color when given', async () => {
      const userId = 'user-1';
      const dto = { title: 'Low', color: '#10B981', tagGroupId: 'group-1' };
      const expected = {
        id: 'tag-2',
        title: 'Low',
        color: '#10B981',
        sortOrder: 0,
        tagGroupId: 'group-1',
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.tag.create.mockResolvedValue(expected);

      const result = await service.create(userId, dto);

      expect(mockPrisma.tag.create).toHaveBeenCalledWith({
        data: {
          title: 'Low',
          color: '#10B981',
          tagGroupId: 'group-1',
          userId,
        },
      });
      expect(result).toEqual(expected);
    });
  });

  describe('findAll', () => {
    it('should return all tags for a user', async () => {
      const userId = 'user-1';
      const expected = [
        { id: 'tag-1', title: 'Urgent', color: '#3B82F6', userId },
        { id: 'tag-2', title: 'Low', color: '#10B981', userId },
      ];
      mockPrisma.tag.findMany.mockResolvedValue(expected);

      const result = await service.findAll(userId);

      expect(mockPrisma.tag.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
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

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a tag after verifying it exists', async () => {
      const userId = 'user-1';
      const tagId = 'tag-1';
      const existing = {
        id: tagId,
        title: 'Urgent',
        color: '#3B82F6',
        tagGroupId: null,
        userId,
      };
      const updated = { ...existing, title: 'Critical', color: '#EF4444' };
      mockPrisma.tag.findFirst.mockResolvedValue(existing);
      mockPrisma.tag.update.mockResolvedValue(updated);

      const result = await service.update(userId, tagId, {
        title: 'Critical',
        color: '#EF4444',
        tagGroupId: undefined,
      });

      expect(mockPrisma.tag.update).toHaveBeenCalledWith({
        where: { id: tagId },
        data: { title: 'Critical', color: '#EF4444' },
      });
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('should delete a tag after verifying it exists', async () => {
      const userId = 'user-1';
      const tagId = 'tag-1';
      const existing = {
        id: tagId,
        title: 'Urgent',
        color: '#3B82F6',
        userId,
      };
      mockPrisma.tag.findFirst.mockResolvedValue(existing);
      mockPrisma.tag.delete.mockResolvedValue(existing);

      const result = await service.remove(userId, tagId);

      expect(mockPrisma.tag.delete).toHaveBeenCalledWith({ where: { id: tagId } });
      expect(result).toEqual(existing);
    });
  });
});