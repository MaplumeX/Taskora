import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { CreateCalendarSubscriptionDto, UpdateCalendarSubscriptionDto } from '@taskora/shared';

import {
  createCalendarSubscription,
  deleteCalendarSubscription,
  getCalendarEvents,
  listCalendarSubscriptions,
  updateCalendarSubscription,
} from '@/api/calendar.api';
import { usePreferencesStore } from '@/stores/preferences.store';
import { groupCalendarEventsByDay, type DayCalendarEvent } from '@/utils/calendarEvents';

export const calendarKeys = {
  all: ['calendar'] as const,
  subscriptions: ['calendar', 'subscriptions'] as const,
  events: (from: string, to: string, timeZone: string) =>
    ['calendar', 'events', from, to, timeZone] as const,
};

/** 日历订阅（ADR 0023），设置页与日程查询共用。 */
export function useCalendarSubscriptions() {
  return useQuery({
    queryKey: calendarKeys.subscriptions,
    queryFn: listCalendarSubscriptions,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

const EMPTY = new Map<string, DayCalendarEvent[]>();

/**
 * [from, to]（账号时区的日期键，含首尾）内的日程，按天分组。没有启用的
 * 订阅时不发请求；离线或请求失败时为空（日程不是副本数据，不报错）。
 */
export function useCalendarEvents(from: string, to: string): Map<string, DayCalendarEvent[]> {
  const timeZone = usePreferencesStore((s) => s.timeZone);
  const { data: subscriptions } = useCalendarSubscriptions();
  const enabled = !!subscriptions?.some((subscription) => subscription.enabled);
  const { data: events } = useQuery({
    queryKey: calendarKeys.events(from, to, timeZone),
    queryFn: () => getCalendarEvents(from, to),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return useMemo(
    () => (enabled && events ? groupCalendarEventsByDay(events, from, to, timeZone) : EMPTY),
    [enabled, events, from, to, timeZone],
  );
}

function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: calendarKeys.all });
}

export function useCreateCalendarSubscription() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (data: CreateCalendarSubscriptionDto) => createCalendarSubscription(data),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendarSubscription() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCalendarSubscriptionDto }) =>
      updateCalendarSubscription(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteCalendarSubscription() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (id: string) => deleteCalendarSubscription(id),
    onSuccess: invalidate,
  });
}
