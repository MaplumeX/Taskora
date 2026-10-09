import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ScheduledType } from '@taskora/shared';

import { setProjectBackend } from '@/api/project-backend';
import { setTaskBackend } from '@/api/task-backend';
import * as usersApi from '@/api/users.api';
import { attachLiveQueries, detachLiveQueries } from '@/engine/live-queries';
import { createEngineProjectBackend } from '@/engine/project-backend.engine';
import { createEngineTaskBackend } from '@/engine/task-backend.engine';
import { usePreferencesStore } from '@/stores/preferences.store';
import { useCalendarDay, useCalendarQueryRefresh } from './useCalendarDay';
import { useFeedQuery } from './useFeed';
import { useHasNewInToday, useNewInTodayKeys } from './useNewInToday';
import { useReviewQueueQuery } from './useReview';
import { useTasksQuery } from './useTasks';

const initial = usePreferencesStore.getState();
let engine: Engine;
let queryClient: QueryClient;
let tasks: ReturnType<typeof createEngineTaskBackend>;
let projects: ReturnType<typeof createEngineProjectBackend>;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(async () => {
  // 只模拟日期，让异步查询和 React Query 的通知继续正常运行。
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  usePreferencesStore.setState({
    timeZone: 'Asia/Shanghai',
    legacyDateTimeZone: 'Asia/Shanghai',
    todayReviewedOn: '2026-10-08',
  });
  engine = await openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: 'calendar-test',
  });
  tasks = createEngineTaskBackend({ engine });
  projects = createEngineProjectBackend({ engine });
  setTaskBackend(tasks);
  setProjectBackend(projects);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  cleanup();
  detachLiveQueries();
  setTaskBackend(undefined);
  setProjectBackend(undefined);
  queryClient.clear();
  await engine.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  usePreferencesStore.setState({
    timeZone: initial.timeZone,
    legacyDateTimeZone: initial.legacyDateTimeZone,
    todayReviewedOn: initial.todayReviewedOn,
  });
});

it('Today 本次访问的黄点随时区重算，同时保留进入时的已看基线', async () => {
  vi.spyOn(usersApi, 'updatePreferences').mockRejectedValue(new Error('offline'));
  const task = await tasks.createTask({
    title: '提前安排的任务',
    scheduledType: ScheduledType.DATE,
    scheduledDate: '2026-10-09',
  });
  vi.setSystemTime(new Date('2026-10-09T01:00:00Z'));
  const items = await tasks.getFeed('today');
  const { result } = renderHook(() => useNewInTodayKeys(items));
  expect(result.current.has(`task:${task.id}`)).toBe(true);
  expect(usePreferencesStore.getState().todayReviewedOn).toBe('2026-10-09');

  act(() => usePreferencesStore.setState({ timeZone: 'Pacific/Kiritimati' }));
  expect(result.current.size).toBe(0);
  act(() => usePreferencesStore.setState({ timeZone: 'Asia/Shanghai' }));
  expect(result.current.has(`task:${task.id}`)).toBe(true);
});

// 两种查询路径均用真实副本后端，验证日历时钟是否把刷新传到各自的缓存。
describe.each(['Engine', 'React Query'] as const)('%s 跨日刷新', (mode) => {
  it('同一天切换账号时区、任务集合不变时，仍重算新到标记', async () => {
    const task = await tasks.createTask({
      title: '提前安排的任务',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-09',
    });
    vi.setSystemTime(new Date('2026-10-09T01:00:00Z'));
    if (mode === 'Engine') attachLiveQueries(engine);
    const { result } = renderHook(
      () => {
        useCalendarQueryRefresh();
        return { today: useFeedQuery('today'), hasNew: useHasNewInToday() };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.hasNew).toBe(true));
    const before = result.current.today.data;

    act(() => usePreferencesStore.setState({ timeZone: 'Pacific/Kiritimati' }));
    await waitFor(() => expect(result.current.hasNew).toBe(false));
    expect(result.current.today.data).toBe(before);
    expect(result.current.today.data?.map((item) => item.id)).toEqual([task.id]);
  });

  it.each(['poll', 'focus', 'visibilitychange', 'timeZone'] as const)(
    '%s：任务、重复实例和项目进入今天，计划列表、计数、新到及回顾同步更新',
    async (trigger) => {
      const dated = (title: string, scheduledDate: string) =>
        tasks.createTask({ title, scheduledType: ScheduledType.DATE, scheduledDate });
      const older = await dated('之前未做', '2026-10-07');
      const previous = await dated('昨天未做', '2026-10-08');
      const arriving = await dated('新一天的任务', '2026-10-09');
      const future = await dated('后天的任务', '2026-10-10');
      const completed = await dated('已完成', '2026-10-09');
      await tasks.completeTask(completed.id);
      const cancelled = await dated('已取消', '2026-10-09');
      await tasks.cancelTask(cancelled.id);
      const trashed = await dated('已删除', '2026-10-09');
      await tasks.deleteTask(trashed.id);
      const repeating = await dated('每日重复', '2026-10-08');
      await tasks.updateTask(repeating.id, {
        repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
      });
      await tasks.completeTask(repeating.id);
      const repeat = (await tasks.getFeed('upcoming')).find((item) => item.title === '每日重复')!;
      const project = await projects.createProject({
        title: '到日项目',
        scheduledType: ScheduledType.DATE,
        scheduledDate: '2026-10-09',
        nextReviewDate: '2026-10-09',
      });
      const anytime = await tasks.createTask({ title: '项目内随时任务', projectId: project.id });
      const someday = await tasks.createTask({
        title: '项目内某天任务',
        projectId: project.id,
        scheduledType: ScheduledType.SOMEDAY,
      });

      vi.setSystemTime(new Date('2026-10-08T15:59:50Z'));
      if (mode === 'Engine') attachLiveQueries(engine);
      const intervals = vi.spyOn(globalThis, 'setInterval');
      const { result } = renderHook(
        () => {
          useCalendarQueryRefresh();
          return {
            day: useCalendarDay(),
            today: useFeedQuery('today'),
            upcoming: useFeedQuery('upcoming'),
            anytime: useFeedQuery('anytime'),
            someday: useFeedQuery('someday'),
            todayTasks: useTasksQuery({ view: 'today' }),
            hasNew: useHasNewInToday(),
            review: useReviewQueueQuery(),
          };
        },
        { wrapper },
      );
      await waitFor(() => {
        expect(result.current.today.data?.map((item) => item.id)).toEqual([older.id, previous.id]);
        expect(result.current.upcoming.data?.map((item) => item.id)).toEqual(
          expect.arrayContaining([arriving.id, future.id, repeat.id, project.id]),
        );
        expect(result.current.anytime.data).toEqual([]);
        expect(result.current.someday.data).toEqual([]);
        expect(result.current.review.data?.items).toEqual([]);
        expect(result.current.hasNew).toBe(false);
      });
      const change = vi.fn();
      const unsubscribe = engine.onChange(change);
      try {
        await act(async () => {
          if (trigger === 'timeZone') {
            // 同一时刻，东京已是次日：使用账号时区，而非设备时区。
            usePreferencesStore.setState({ timeZone: 'Asia/Tokyo' });
          } else {
            vi.setSystemTime(new Date('2026-10-08T16:00:20Z'));
            if (trigger === 'poll') {
              const tick = intervals.mock.calls.find(([, delay]) => delay === 30_000)?.[0];
              expect(tick).toBeTypeOf('function');
              (tick as () => void)();
            } else if (trigger === 'focus') {
              window.dispatchEvent(new Event('focus'));
            } else {
              document.dispatchEvent(new Event('visibilitychange'));
            }
          }
        });
        await waitFor(() => {
          expect(result.current.day).toContain('2026-10-09');
          expect(result.current.today.data?.map((item) => item.id)).toEqual(
            expect.arrayContaining([older.id, previous.id, arriving.id, repeat.id, project.id]),
          );
          expect(result.current.today.data).toHaveLength(5);
          expect(result.current.todayTasks.data?.map((item) => item.id)).toEqual([
            older.id,
            previous.id,
            arriving.id,
            repeat.id,
          ]);
          expect(result.current.upcoming.data?.map((item) => item.id)).toEqual([future.id]);
          expect(result.current.anytime.data?.map((item) => item.id)).toEqual([anytime.id]);
          expect(result.current.someday.data?.map((item) => item.id)).toEqual([someday.id]);
          expect(result.current.hasNew).toBe(true);
          expect(result.current.review.data?.items).toEqual([{ kind: 'project', id: project.id }]);
        });
        // 跨日是视图推导，不需要修改任务或等待同步。
        expect(change).not.toHaveBeenCalled();
        expect((await tasks.getTask(previous.id)).scheduledDate).toBe('2026-10-08');
        expect((await tasks.getTask(arriving.id)).scheduledDate).toBe('2026-10-09');
      } finally {
        unsubscribe();
      }
    },
  );
});
