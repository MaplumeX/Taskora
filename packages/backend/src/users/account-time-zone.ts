import type { ReviewContext, ViewContext } from '@taskora/engine';
import {
  accountLogging,
  accountReviewIntervalDefaults,
  accountTimeZone,
  instantDateKey,
  legacyDateTimeZone,
} from '@taskora/shared';
import type { PrismaService } from '../prisma/prisma.service';

async function userPreferences(prisma: PrismaService, userId: string): Promise<unknown> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return user?.preferences;
}

export async function userCalendarZones(
  prisma: PrismaService,
  userId: string,
): Promise<{ timeZone: string; legacyDateTimeZone: string }> {
  const preferences = await userPreferences(prisma, userId);
  return {
    timeZone: accountTimeZone(preferences),
    legacyDateTimeZone: legacyDateTimeZone(preferences),
  };
}

/** 视图判定的上下文：账号时区、当前时刻与移入时机（ADR 0022）。 */
export async function userViewContext(
  prisma: PrismaService,
  userId: string,
  now = new Date(),
): Promise<ViewContext> {
  const preferences = await userPreferences(prisma, userId);
  return {
    timeZone: accountTimeZone(preferences),
    legacyDateTimeZone: legacyDateTimeZone(preferences),
    now,
    logging: accountLogging(preferences),
  };
}

export async function userTimeZone(prisma: PrismaService, userId: string): Promise<string> {
  return (await userCalendarZones(prisma, userId)).timeZone;
}

/** 账号时区与回顾排期上下文（账号时区的今天、默认回顾间隔）。 */
export async function userReviewSettings(
  prisma: PrismaService,
  userId: string,
  now = new Date(),
): Promise<{ zones: { timeZone: string; legacyDateTimeZone: string }; review: ReviewContext }> {
  const preferences = await userPreferences(prisma, userId);
  const timeZone = accountTimeZone(preferences);
  return {
    zones: { timeZone, legacyDateTimeZone: legacyDateTimeZone(preferences) },
    review: {
      today: instantDateKey(now, timeZone),
      defaults: accountReviewIntervalDefaults(preferences),
    },
  };
}
