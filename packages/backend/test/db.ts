import { PrismaClient } from '@prisma/client';

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

  await testPrisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Task", "Project", "Area", "User" CASCADE',
  );
}

export async function disconnectTestDb(): Promise<void> {
  await testPrisma.$disconnect();
}