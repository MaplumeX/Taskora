import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { generateRt, hashRt } from '../src/auth/refresh-token.helpers';

interface RtRow {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

describe('AuthService — refresh tokens', () => {
  let service: AuthService;
  let mockPrisma: InstanceType<typeof PrismaService>;
  let mockJwtService: { sign: ReturnType<typeof vi.fn> };

  const userId = 'user-1';
  const familyId = 'family-1';

  let rtStore: Map<string, RtRow>;
  let rtCounter: number;

  beforeEach(() => {
    rtStore = new Map();
    rtCounter = 0;

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock-access-token'),
    };

    mockPrisma = {
      refreshToken: {
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const row: RtRow = {
            id: `rt-${++rtCounter}`,
            userId: args.data.userId as string,
            tokenHash: args.data.tokenHash as string,
            familyId: args.data.familyId as string,
            expiresAt: args.data.expiresAt as Date,
            revokedAt: null,
            createdAt: new Date(),
          };
          rtStore.set(row.tokenHash, row);
          return row;
        }),
        findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
          return rtStore.get(where.tokenHash) ?? null;
        }),
        update: vi.fn(async (args: { where: { id: string }; data: { revokedAt?: Date } }) => {
          const row = [...rtStore.values()].find((r) => r.id === args.where.id);
          if (row && args.data.revokedAt !== undefined) {
            row.revokedAt = args.data.revokedAt;
          }
          return row;
        }),
        updateMany: vi.fn(
          async (args: {
            where: { familyId?: string; tokenHash?: string; revokedAt?: null };
            data: { revokedAt: Date };
          }) => {
            let count = 0;
            for (const row of rtStore.values()) {
              let match = true;
              if (args.where.familyId !== undefined && row.familyId !== args.where.familyId)
                match = false;
              if (args.where.tokenHash !== undefined && row.tokenHash !== args.where.tokenHash)
                match = false;
              if (args.where.revokedAt === null && row.revokedAt !== null) match = false;
              if (match) {
                row.revokedAt = args.data.revokedAt;
                count++;
              }
            }
            return { count };
          },
        ),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: userId,
          email: 'test@example.com',
          displayName: 'Tester',
          avatarUrl: null,
        }),
      },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => {
        return Promise.all(operations);
      }),
    } as unknown as InstanceType<typeof PrismaService>;

    service = new AuthService(mockPrisma, mockJwtService as never);
  });

  describe('issueRefreshToken', () => {
    it('stores the hash (not plaintext) in the database', async () => {
      const rt = await service.issueRefreshToken(userId, familyId);

      const stored = [...rtStore.values()][0];
      expect(stored.tokenHash).toBe(hashRt(rt));
      expect(stored.tokenHash).not.toBe(rt);
      expect(stored.familyId).toBe(familyId);
      expect(stored.revokedAt).toBeNull();
    });
  });

  describe('rotateRefreshToken', () => {
    it('returns new access token + new RT, marks old RT revoked', async () => {
      const originalRt = await service.issueRefreshToken(userId, familyId);

      const result = await service.rotateRefreshToken(originalRt);

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.newRt).not.toBe(originalRt);
      expect(result.user.id).toBe(userId);

      // old RT should be revoked
      expect(rtStore.get(hashRt(originalRt))!.revokedAt).not.toBeNull();

      // new RT should exist and be valid
      const newRow = rtStore.get(hashRt(result.newRt))!;
      expect(newRow).toBeDefined();
      expect(newRow.revokedAt).toBeNull();
      expect(newRow.familyId).toBe(familyId);
    });

    it('throws on expired RT', async () => {
      // Create an expired RT directly in the store
      const expiredRt = generateRt();
      const hash = hashRt(expiredRt);
      rtStore.set(hash, {
        id: `rt-${++rtCounter}`,
        userId,
        tokenHash: hash,
        familyId,
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
        createdAt: new Date(),
      });

      await expect(service.rotateRefreshToken(expiredRt)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('triggers reuse detection: replays a revoked RT → whole family revoked', async () => {
      const originalRt = await service.issueRefreshToken(userId, familyId);

      // First rotation succeeds
      const firstRotation = await service.rotateRefreshToken(originalRt);

      // Reusing the original (now revoked) RT should trigger reuse detection
      await expect(service.rotateRefreshToken(originalRt)).rejects.toThrow(
        UnauthorizedException,
      );

      // The entire family should be revoked (including the rotated token)
      const rotatedRow = rtStore.get(hashRt(firstRotation.newRt))!;
      expect(rotatedRow.revokedAt).not.toBeNull();

      for (const row of rtStore.values()) {
        if (row.familyId === familyId) {
          expect(row.revokedAt).not.toBeNull();
        }
      }
    });

    it('throws on unknown RT', async () => {
      await expect(service.rotateRefreshToken('nonexistent-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('marks the token as revoked', async () => {
      const rt = await service.issueRefreshToken(userId, familyId);

      await service.revokeRefreshToken(rt);

      expect(rtStore.get(hashRt(rt))!.revokedAt).not.toBeNull();
    });

    it('is a no-op when no token is provided', async () => {
      await expect(service.revokeRefreshToken(undefined)).resolves.toBeUndefined();
    });
  });
});
