import {
  accountTimeZone,
  legacyDateTimeZone,
  calendarDateKey,
  instantDateKey,
} from '@taskora/shared';
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

/** Legacy non-midnight dates and canonical dates share the same calendar predicate. */
export function matchesCalendarView(
  date: Date | null,
  view: string,
  zone: string,
  now = new Date(),
  legacyZone = zone,
): boolean {
  if (view !== 'today' && view !== 'upcoming') return true;
  if (!date) return false;
  const day = calendarDateKey(date, legacyZone);
  const today = instantDateKey(now, zone);
  return view === 'today' ? day <= today : day > today;
}
