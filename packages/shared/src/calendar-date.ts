import { Temporal } from '@js-temporal/polyfill';

/** IANA zone validation is shared by REST, preferences and pure date calculations. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || /^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function accountTimeZone(preferences: unknown): string {
  const zone = (preferences as { timeZone?: unknown } | null)?.timeZone;
  return isValidTimeZone(zone) ? zone : 'UTC';
}

/** Old timestamp-encoded dates retain their original account zone after a zone change. */
export function legacyDateTimeZone(preferences: unknown): string {
  const zone = (preferences as { legacyDateTimeZone?: unknown } | null)?.legacyDateTimeZone;
  return isValidTimeZone(zone) ? zone : accountTimeZone(preferences);
}

/** Instant -> calendar day in an explicit zone (never the host's TZ). */
export function instantDateKey(value: string | Date, timeZone: string): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  return Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

/**
 * Calendar date / UTC-midnight storage encoding / legacy ISO -> YYYY-MM-DD.
 * UTC midnight is a date encoding, not an instant. Other legacy timestamps
 * need the account zone because old clients wrote local-midnight instants.
 */
export function calendarDateKey(value: string | Date, timeZone = 'UTC'): string {
  const text = value instanceof Date ? value.toISOString() : value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Temporal.PlainDate.from(text).toString();
  // A timezone-less ISO datetime has no instant semantics; preserve its day
  // rather than letting Date.parse silently use the host timezone.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    return Temporal.PlainDateTime.from(text).toPlainDate().toString();
  }
  const iso = Temporal.Instant.from(text).toString({ fractionalSecondDigits: 3 });
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : instantDateKey(iso, timeZone);
}

/** Date-only wire value -> the existing PostgreSQL DateTime storage encoding. */
export function calendarDateStorage(value: string | Date, timeZone = 'UTC'): Date {
  return new Date(`${calendarDateKey(value, timeZone)}T00:00:00.000Z`);
}

/**
 * Resolve a reminder wall time. Temporal's compatible policy moves a skipped
 * DST time forward by the gap and selects the earlier of a repeated time.
 */
export function calendarTimeInstant(day: string, time: string, timeZone: string): number {
  return Temporal.PlainDate.from(day)
    .toPlainDateTime(Temporal.PlainTime.from(time))
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' }).epochMilliseconds;
}
