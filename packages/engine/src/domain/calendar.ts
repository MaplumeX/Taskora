/**
 * 日历日期（CONTEXT：Calendar Date）的领域口径。两端存储形态不同
 * （设备副本存 `YYYY-MM-DD`，Postgres 存 UTC 零点的 DateTime，旧数据
 * 可能是本地零点的时刻），领域函数一律先归一为日期键再比较。
 */

import { calendarDateKey, instantDateKey } from '@taskora/shared';

/** 账户时区：timeZone 定义「今天」，legacyDateTimeZone 解读旧的非零点时刻。 */
export interface CalendarZones {
  timeZone: string;
  legacyDateTimeZone: string;
}

/** 视图判定的上下文：时区 + 当前时刻。 */
export interface CalendarContext extends CalendarZones {
  now: Date;
}

/** 存储值 / 输入值 → 日期键；空值与无法解析的值为 null。 */
export function dateKeyOf(value: unknown, zones: CalendarZones): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  try {
    return calendarDateKey(value, zones.legacyDateTimeZone);
  } catch {
    return null;
  }
}

export function todayKey(context: CalendarContext): string {
  return instantDateKey(context.now, context.timeZone);
}

/** 时间戳（Date 或 ISO 字符串）→ 毫秒；空值与无法解析的值为 null。 */
export function instantMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
