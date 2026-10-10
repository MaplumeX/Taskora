import type {
  CalendarEventDto,
  CalendarSubscriptionDto,
  CreateCalendarSubscriptionDto,
  UpdateCalendarSubscriptionDto,
} from '@taskora/shared';

import { apiClient } from './client';

// 日历订阅（ADR 0023）：只走 REST，不进 Local Replica。

export function listCalendarSubscriptions(): Promise<CalendarSubscriptionDto[]> {
  return apiClient.get<CalendarSubscriptionDto[]>('/calendar/subscriptions').then((r) => r.data);
}

export function createCalendarSubscription(
  data: CreateCalendarSubscriptionDto,
): Promise<CalendarSubscriptionDto> {
  return apiClient
    .post<CalendarSubscriptionDto>('/calendar/subscriptions', data)
    .then((r) => r.data);
}

export function updateCalendarSubscription(
  id: string,
  data: UpdateCalendarSubscriptionDto,
): Promise<CalendarSubscriptionDto> {
  return apiClient
    .patch<CalendarSubscriptionDto>(`/calendar/subscriptions/${id}`, data)
    .then((r) => r.data);
}

export function deleteCalendarSubscription(id: string): Promise<{ ok: boolean }> {
  return apiClient.delete<{ ok: boolean }>(`/calendar/subscriptions/${id}`).then((r) => r.data);
}

/** [from, to]（账号时区的日期键，含首尾）内所有启用订阅的日程。 */
export function getCalendarEvents(from: string, to: string): Promise<CalendarEventDto[]> {
  return apiClient
    .get<CalendarEventDto[]>('/calendar/events', { params: { from, to } })
    .then((r) => r.data);
}
