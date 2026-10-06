import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Test database helper.
 *
 * Reads `TEST_DATABASE_URL` and exposes a dedicated PrismaClient instance
 * plus a `resetDb()` function that TRUNCATEs all business tables in
 * dependency order.
 *
 * If `TEST_DATABASE_URL` is not set, calling `resetDb()` will throw —
 * e2e tests that import this module should guard with `describe.skip`.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

/**
 * Lazy PrismaClient — only instantiated when actually accessed,
 * so importing this module doesn't fail when TEST_DATABASE_URL is unset.
 */
let _testPrisma: PrismaClient | null = null;

export const testPrisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_testPrisma) {
      _testPrisma = new PrismaClient({
        datasources: { db: { url: TEST_DATABASE_URL ?? process.env.DATABASE_URL } },
      });
    }
    return Reflect.get(_testPrisma, prop);
  },
});

/**
 * TRUNCATE all business tables in dependency order.
 * Task → Project → Area → User
 */
export async function resetDb(): Promise<void> {
  if (!TEST_DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Please provide a test database URL to run e2e tests.',
    );
  }

  // 上一个用例的 collector tap 可能仍在后台写同步日志（SyncChange 引用
  // User）：TRUNCATE 与它偶发死锁时重试。
  for (let attempt = 0; ; attempt += 1) {
    try {
      await testPrisma.$executeRawUnsafe(
        'TRUNCATE TABLE "TaskTag", "ProjectTag", "AreaTag", "Task", "Project", "Area", "Tag", "CompactedEntity", "User" CASCADE',
      );
      return;
    } catch (error) {
      const deadlock = (error as { meta?: { code?: string } }).meta?.code === '40P01';
      if (!deadlock || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export async function disconnectTestDb(): Promise<void> {
  await testPrisma.$disconnect();
}

/**
 * testPrisma 视作 PrismaService：补上 rawTransaction（生产实现走未扩展的
 * base client；测试客户端本就未挂 collector，直接用 $transaction）。
 */
export function testPrismaService(): PrismaService {
  return new Proxy(testPrisma, {
    get(target, prop, receiver) {
      if (prop === 'rawTransaction') {
        return (run: (tx: unknown) => Promise<unknown>, options?: object) =>
          target.$transaction(run as never, options as never);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as PrismaService;
}
