import { accountTimeZone, legacyDateTimeZone } from '@taskora/shared';
import type { PrismaService } from '../prisma/prisma.service';

export async function userCalendarZones(
  prisma: PrismaService,
  userId: string,
): Promise<{ timeZone: string; legacyDateTimeZone: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return {
    timeZone: accountTimeZone(user?.preferences),
    legacyDateTimeZone: legacyDateTimeZone(user?.preferences),
  };
}

export async function userTimeZone(prisma: PrismaService, userId: string): Promise<string> {
  return (await userCalendarZones(prisma, userId)).timeZone;
}
