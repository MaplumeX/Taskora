import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CalendarSubscription } from '@prisma/client';
import {
  CALENDAR_COLORS,
  CALENDAR_EVENTS_MAX_DAYS,
  isCalendarColor,
  type CalendarColor,
  type CalendarEventDto,
  type CalendarSubscriptionDto,
} from '@taskora/shared';

import { PrismaService } from '../prisma/prisma.service';
import { userCalendarZones } from '../users/account-time-zone';
import type {
  CreateCalendarSubscriptionBody,
  UpdateCalendarSubscriptionBody,
} from './dto/calendar.dto';
import { CalendarFetchError, fetchCalendarText, normalizeCalendarUrl } from './fetch-calendar';
import { expandCalendar, parseCalendar, type ParsedCalendar } from './ics';

/** 解析结果的缓存时长：过期后下次查询重新拉取。 */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** 缓存的订阅数上限（超出时淘汰最早拉取的）。 */
const CACHE_MAX_ENTRIES = 500;

interface CacheEntry {
  url: string;
  fetchedAt: number;
  calendar: ParsedCalendar;
}

/**
 * 日历订阅（ADR 0023）：订阅存在 hub，日程由 hub 拉取 ICS、按订阅缓存
 * 解析结果，查询时按账号时区展开到区间。不是同步实体，不经 merger。
 */
@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<ParsedCalendar>>();

  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<CalendarSubscriptionDto[]> {
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async create(userId: string, body: CreateCalendarSubscriptionBody) {
    const url = toUrl(body.url);
    // 添加前先拉取一次：链接无效当场告知，而不是留下一个永远失败的订阅
    let calendar: ParsedCalendar;
    try {
      calendar = await downloadAndParse(url);
    } catch (error) {
      throw new UnprocessableEntityException(fetchErrorCode(error));
    }
    const color = body.color ?? (await this.leastUsedColor(userId));
    const row = await this.prisma.calendarSubscription.create({
      data: {
        userId,
        url,
        name: body.name?.trim() || calendar.name || new URL(url).hostname,
        color,
        lastFetchedAt: new Date(),
      },
    });
    this.remember(row.id, url, calendar);
    return toDto(row);
  }

  async update(userId: string, id: string, body: UpdateCalendarSubscriptionBody) {
    await this.findOwned(userId, id);
    const row = await this.prisma.calendarSubscription.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() || undefined } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
    return toDto(row);
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.calendarSubscription.delete({ where: { id } });
    this.cache.delete(id);
    return { ok: true };
  }

  /** 所有启用订阅在 [from, to]（账号时区的日期键，含首尾）内的日程。 */
  async events(userId: string, from: string, to: string): Promise<CalendarEventDto[]> {
    const span = daySpan(from, to);
    if (span === null || span < 1 || span > CALENDAR_EVENTS_MAX_DAYS) {
      throw new BadRequestException('invalid_range');
    }
    const [zones, subscriptions] = await Promise.all([
      userCalendarZones(this.prisma, userId),
      this.prisma.calendarSubscription.findMany({
        where: { userId, enabled: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const perSubscription = await Promise.all(
      subscriptions.map(async (subscription) => {
        const calendar = await this.load(subscription);
        if (!calendar) return [];
        const color = isCalendarColor(subscription.color) ? subscription.color : 'blue';
        return expandCalendar(calendar, { from, to, timeZone: zones.timeZone }).map(
          (occurrence): CalendarEventDto => {
            const id = `${subscription.id}:${occurrence.uid}:${occurrence.start}`;
            const base = {
              id,
              subscriptionId: subscription.id,
              color,
              title: occurrence.title,
              location: occurrence.location,
            };
            return occurrence.allDay
              ? { ...base, allDay: true, start: occurrence.start, end: occurrence.end }
              : {
                  ...base,
                  allDay: false,
                  start: new Date(occurrence.start).toISOString(),
                  end: new Date(occurrence.end).toISOString(),
                };
          },
        );
      }),
    );
    return perSubscription.flat();
  }

  /**
   * 订阅的解析结果：缓存新鲜则直接用；否则重新拉取并记下结果。拉取失败
   * 时沿用过期缓存（没有则为 null），并把错误记在订阅上供设置页显示。
   */
  private async load(subscription: CalendarSubscription): Promise<ParsedCalendar | null> {
    const cached = this.cache.get(subscription.id);
    if (cached && cached.url === subscription.url && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.calendar;
    }
    let pending = this.inflight.get(subscription.id);
    if (!pending) {
      pending = downloadAndParse(subscription.url).finally(() =>
        this.inflight.delete(subscription.id),
      );
      this.inflight.set(subscription.id, pending);
    }
    try {
      const calendar = await pending;
      this.remember(subscription.id, subscription.url, calendar);
      await this.recordFetch(subscription.id, { lastFetchedAt: new Date(), lastError: null });
      return calendar;
    } catch (error) {
      const code = fetchErrorCode(error);
      if (subscription.lastError !== code) {
        this.logger.warn(`calendar subscription ${subscription.id} failed: ${code}`);
        await this.recordFetch(subscription.id, { lastError: code });
      }
      return cached?.url === subscription.url ? cached.calendar : null;
    }
  }

  private async recordFetch(
    id: string,
    data: { lastFetchedAt?: Date; lastError: string | null },
  ): Promise<void> {
    // 订阅可能在拉取期间被删除
    await this.prisma.calendarSubscription.updateMany({ where: { id }, data });
  }

  private remember(id: string, url: string, calendar: ParsedCalendar) {
    this.cache.delete(id);
    this.cache.set(id, { url, fetchedAt: Date.now(), calendar });
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.calendarSubscription.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Calendar subscription not found');
    return row;
  }

  /** 新订阅的颜色：调色板里用得最少的一个（同数取靠前的）。 */
  private async leastUsedColor(userId: string): Promise<CalendarColor> {
    const rows = await this.prisma.calendarSubscription.findMany({
      where: { userId },
      select: { color: true },
    });
    const counts = new Map<string, number>(CALENDAR_COLORS.map((color) => [color, 0]));
    for (const { color } of rows) counts.set(color, (counts.get(color) ?? 0) + 1);
    return CALENDAR_COLORS.reduce((best, color) =>
      (counts.get(color) ?? 0) < (counts.get(best) ?? 0) ? color : best,
    );
  }
}

async function downloadAndParse(url: string): Promise<ParsedCalendar> {
  const text = await fetchCalendarText(url);
  try {
    return parseCalendar(text);
  } catch {
    throw new CalendarFetchError('not_ics');
  }
}

function toUrl(input: string): string {
  try {
    return normalizeCalendarUrl(input).toString();
  } catch (error) {
    throw new BadRequestException(fetchErrorCode(error));
  }
}

function fetchErrorCode(error: unknown): string {
  return error instanceof CalendarFetchError ? error.storedCode : 'unreachable';
}

/** 两个日期键之间的天数（含首尾）；不合法时为 null。 */
function daySpan(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000) + 1;
}

function toDto(row: CalendarSubscription): CalendarSubscriptionDto {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    color: isCalendarColor(row.color) ? row.color : 'blue',
    enabled: row.enabled,
    lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}
