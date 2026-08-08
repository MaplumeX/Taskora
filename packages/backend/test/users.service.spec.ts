import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import type {
  UpdatePreferencesDto,
  DeleteAccountDto,
} from '../src/users/dto/users.dto';

describe('UsersService', () => {
  let service: UsersService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';
  const now = new Date();

  const baseUser = {
    id: userId,
    email: 'test@example.com',
    displayName: 'Tester',
    avatarUrl: null,
    preferences: null,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      task: { findMany: vi.fn() },
      project: { findMany: vi.fn() },
      area: { findMany: vi.fn() },
      tag: { findMany: vi.fn() },
      tagGroup: { findMany: vi.fn() },
      projectHeading: { findMany: vi.fn() },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new UsersService(mockPrisma);
  });

  describe('updateProfile', () => {
    it('only updates fields that are explicitly provided (undefined = keep)', async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      await service.updateProfile(userId, {
        displayName: 'New Name',
        // avatarUrl is undefined → not touched
      });

      const call = mockPrisma.user.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: userId });
      expect(call.data).toEqual({ displayName: 'New Name' });
    });

    it('treats null as explicit clear', async () => {
      mockPrisma.user.update.mockResolvedValue({ ...baseUser, displayName: null });

      await service.updateProfile(userId, { displayName: null });

      const call = mockPrisma.user.update.mock.calls[0][0];
      expect(call.data).toEqual({ displayName: null });
    });

    it('updates multiple fields at once', async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      await service.updateProfile(userId, {
        displayName: 'X',
        avatarUrl: 'https://example.com/a.png',
      });

      expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({
        displayName: 'X',
        avatarUrl: 'https://example.com/a.png',
      });
    });
  });

  describe('updatePassword', () => {
    it('throws UnauthorizedException when currentPassword is wrong', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: hash });

      await expect(
        service.updatePassword(userId, {
          currentPassword: 'wrong-password',
          newPassword: 'newpassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePassword(userId, {
          currentPassword: 'whatever',
          newPassword: 'newpassword123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates passwordHash when currentPassword matches and new password works for login', async () => {
      const oldHash = await bcrypt.hash('old-password', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: oldHash });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.updatePassword(userId, {
        currentPassword: 'old-password',
        newPassword: 'newpassword123',
      });

      expect(result).toEqual({ ok: true });

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: userId });

      // The stored hash should match the new password (not the old one)
      const storedHash = updateCall.data.passwordHash;
      expect(await bcrypt.compare('newpassword123', storedHash)).toBe(true);
      expect(await bcrypt.compare('old-password', storedHash)).toBe(false);
    });
  });

  describe('updatePreferences', () => {
    it('merges dto fields into existing preferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        preferences: { theme: 'dark' },
      });
      mockPrisma.user.update.mockResolvedValue({
        ...baseUser,
        preferences: { theme: 'dark', language: 'zh' },
      });

      const dto: UpdatePreferencesDto = { language: 'zh' };
      const result = await service.updatePreferences(userId, dto);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: userId });
      expect(updateCall.data).toEqual({
        preferences: { theme: 'dark', language: 'zh' },
      });
      expect(result.preferences).toEqual({ theme: 'dark', language: 'zh' });
    });

    it('starts from null preferences', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ preferences: null });
      mockPrisma.user.update.mockResolvedValue({
        ...baseUser,
        preferences: { theme: 'light' },
      });

      const result = await service.updatePreferences(userId, {
        theme: 'light',
      });

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data).toEqual({ preferences: { theme: 'light' } });
      expect(result.preferences).toEqual({ theme: 'light' });
    });

    it('returns full user with USER_PUBLIC_SELECT fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ preferences: null });
      const fullUser = {
        ...baseUser,
        preferences: { theme: 'dark', language: 'en', weekStartsOn: 1 },
      };
      mockPrisma.user.update.mockResolvedValue(fullUser);

      const result = await service.updatePreferences(userId, {
        theme: 'dark',
        language: 'en',
        weekStartsOn: 1,
      });

      expect(result).toEqual(fullUser);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePreferences(userId, { theme: 'dark' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAccount', () => {
    it('deletes user and returns ok when password is correct', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: hash });
      mockPrisma.user.delete.mockResolvedValue({});

      const dto: DeleteAccountDto = { password: 'correct-password' };
      const result = await service.deleteAccount(userId, dto);

      expect(result).toEqual({ ok: true });
      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('throws UnauthorizedException when password is wrong', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: hash });

      await expect(
        service.deleteAccount(userId, { password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteAccount(userId, { password: 'whatever' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportData', () => {
    it('returns full nested structure with all user data', async () => {
      const userExport = {
        id: userId,
        email: 'test@example.com',
        displayName: 'Tester',
        avatarUrl: null,
        preferences: { theme: 'dark' },
        createdAt: now,
        updatedAt: now,
      };
      mockPrisma.user.findUnique.mockResolvedValue(userExport);
      mockPrisma.task.findMany.mockResolvedValue([{ id: 't1' }]);
      mockPrisma.project.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.area.findMany.mockResolvedValue([{ id: 'a1' }]);
      mockPrisma.tag.findMany.mockResolvedValue([{ id: 'tag1' }]);
      mockPrisma.tagGroup.findMany.mockResolvedValue([{ id: 'tg1' }]);
      mockPrisma.projectHeading.findMany.mockResolvedValue([{ id: 'h1' }]);

      const result = await service.exportData(userId);

      expect(result.version).toBe('0.1.0');
      expect(result.exportedAt).toEqual(expect.any(String));
      expect(result.user).toEqual(userExport);
      expect(result.tasks).toEqual([{ id: 't1' }]);
      expect(result.projects).toEqual([{ id: 'p1' }]);
      expect(result.areas).toEqual([{ id: 'a1' }]);
      expect(result.tags).toEqual([{ id: 'tag1' }]);
      expect(result.tagGroups).toEqual([{ id: 'tg1' }]);
      expect(result.projectHeadings).toEqual([{ id: 'h1' }]);
    });

    it('queries with userId isolation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        preferences: null,
      });
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.area.findMany.mockResolvedValue([]);
      mockPrisma.tag.findMany.mockResolvedValue([]);
      mockPrisma.tagGroup.findMany.mockResolvedValue([]);
      mockPrisma.projectHeading.findMany.mockResolvedValue([]);

      await service.exportData(userId);

      expect(mockPrisma.task.findMany.mock.calls[0][0].where).toEqual({
        userId,
      });
      expect(mockPrisma.project.findMany.mock.calls[0][0].where).toEqual({
        userId,
      });
      expect(mockPrisma.area.findMany.mock.calls[0][0].where).toEqual({
        userId,
      });
      expect(mockPrisma.tag.findMany.mock.calls[0][0].where).toEqual({
        userId,
      });
      expect(mockPrisma.tagGroup.findMany.mock.calls[0][0].where).toEqual({
        userId,
      });
      expect(mockPrisma.projectHeading.findMany.mock.calls[0][0].where).toEqual({
        userId,
      });
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.exportData(userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
