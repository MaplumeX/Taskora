/**
 * 日历订阅（Calendar Subscription）与日程（Calendar Event），ADR 0023。
 *
 * 订阅存在 hub、经 REST 管理；日程由 hub 拉取订阅的 ICS 后展开，只读，
 * 不是 Task、不进 Local Replica。
 */

/** 订阅颜色调色板的键（UI 映射到具体色值）。 */
export const CALENDAR_COLORS = [
  'blue',
  'green',
  'orange',
  'purple',
  'red',
  'teal',
  'pink',
  'yellow',
] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

export function isCalendarColor(value: unknown): value is CalendarColor {
  return (CALENDAR_COLORS as readonly unknown[]).includes(value);
}

/**
 * 拉取订阅失败的原因。`http_error` 在存储与线上形态里带状态码后缀
 * （`http_error:404`）。
 */
export type CalendarFetchErrorCode =
  | 'invalid_url'
  | 'blocked_address'
  | 'unreachable'
  | 'timeout'
  | 'http_error'
  | 'too_large'
  | 'not_ics';

/**
 * `GET /calendar/events` 一次最多可查询的天数（含首尾）：要覆盖 Upcoming
 * 的整个区间（今天 + 本周 7 天 + 之后 3 个月分组，最多 100 天）。
 */
export const CALENDAR_EVENTS_MAX_DAYS = 100;

export interface CalendarSubscriptionDto {
  id: string;
  name: string;
  url: string;
  color: CalendarColor;
  enabled: boolean;
  lastFetchedAt: string | null;
  /** 最近一次拉取失败的错误码（见 CalendarFetchErrorCode）；成功后为 null。 */
  lastError: string | null;
  createdAt: string;
}

export interface CreateCalendarSubscriptionDto {
  /** https / http / webcal 链接。 */
  url: string;
  /** 缺省取日历自带的名称（X-WR-CALNAME），再缺省取主机名。 */
  name?: string;
  color?: CalendarColor;
}

export interface UpdateCalendarSubscriptionDto {
  name?: string;
  color?: CalendarColor;
  enabled?: boolean;
}

interface CalendarEventBase {
  /** 订阅内一次出现的稳定 id：`<subscriptionId>:<UID>:<出现的开始>`。 */
  id: string;
  subscriptionId: string;
  color: CalendarColor;
  title: string;
  location: string | null;
}

/** 全天日程：日期键，`end` 不含（单日日程 end = start + 1 天）。 */
export interface AllDayCalendarEventDto extends CalendarEventBase {
  allDay: true;
  start: string;
  end: string;
}

/** 定时日程：UTC 时刻（ISO）。 */
export interface TimedCalendarEventDto extends CalendarEventBase {
  allDay: false;
  start: string;
  end: string;
}

export type CalendarEventDto = AllDayCalendarEventDto | TimedCalendarEventDto;
