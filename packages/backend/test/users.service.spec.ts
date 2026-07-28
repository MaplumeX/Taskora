import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';

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
    timezone: 'Asia/Shanghai',
    locale: 'zh',
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new UsersService(mockPrisma);
  });

  describe('updateProfile', () => {
    it('only updates fields that are explicitly provided (undefined = keep)', async () => {
      mockPrisma.user.update.mockResolvedValue(baseUser);

      await service.updateProfile(userId, {
        displayName: 'New Name',
        // avatarUrl, timezone, locale are undefined → not touched
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
        timezone: 'Europe/London',
        locale: 'en',
      });

      expect(mockPrisma.user.update.mock.calls[0][0].data).toEqual({
        displayName: 'X',
        avatarUrl: 'https://example.com/a.png',
        timezone: 'Europe/London',
        locale: 'en',
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
});
