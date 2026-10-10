/**
 * 移入时机（Logging Mode，ADR 0022）— 设备 Engine 后端：尚未移入 Logbook 的
 * 已了结条目留在原视图与项目任务列表里，Log Completed（推进水位线）后
 * 进入 Logbook。
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ProjectStatus, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { usePreferencesStore } from '@/stores/preferences.store';
import { createEngineTaskBackend } from './task-backend.engine';

const initial = usePreferencesStore.getState();
const NOW = new Date('2026-10-10T02:00:00.000Z');
const SETTLED = '2026-10-10T01:00:00.000Z';

describe('移入时机 — 设备 Engine 后端', () => {
  let engine: Engine;
  let backend: ReturnType<typeof createEngineTaskBackend>;

  beforeAll(async () => {
    engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'logging-device',
    });
    await engine.create('project', {
      id: 'p-done',
      title: 'Done project',
      status: ProjectStatus.COMPLETED,
      completedAt: SETTLED,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-10',
      bucket: 'SCHEDULED',
      trashedAt: null,
      position: 'a0',
    });
    await engine.create('project', {
      id: 'p-open',
      title: 'Open project',
      status: ProjectStatus.ACTIVE,
      scheduledType: ScheduledType.NONE,
      bucket: 'ANYTIME',
      trashedAt: null,
      position: 'a1',
    });
    await engine.create('task', {
      id: 't-done',
      title: 'Done today',
      status: TaskStatus.COMPLETED,
      settledAt: SETTLED,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-10',
      bucket: TaskBucket.SCHEDULED,
      projectId: 'p-open',
      trashedAt: null,
      position: 'a0',
    });
    await engine.create('task', {
      id: 't-open',
      title: 'Open',
      status: TaskStatus.ACTIVE,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-10',
      bucket: TaskBucket.SCHEDULED,
      projectId: 'p-open',
      trashedAt: null,
      position: 'a1',
    });
    backend = createEngineTaskBackend({ engine });
  });

  function at(mode: 'IMMEDIATE' | 'MANUAL', loggedThrough: string | null) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    usePreferencesStore.setState({
      timeZone: 'UTC',
      legacyDateTimeZone: 'UTC',
      loggingMode: mode,
      loggedThrough,
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    usePreferencesStore.setState({
      timeZone: initial.timeZone,
      legacyDateTimeZone: initial.legacyDateTimeZone,
      loggingMode: initial.loggingMode,
      loggedThrough: initial.loggedThrough,
    });
  });

  const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();

  it('立即模式：已了结的只在 Logbook', async () => {
    at('IMMEDIATE', null);
    expect(ids(await backend.getFeed('today'))).toEqual(['t-open']);
    expect(ids(await backend.getFeed('logbook'))).toEqual(['p-done', 't-done']);
    expect(ids(await backend.getTasks({ projectId: 'p-open' }))).toEqual(['t-open']);
  });

  it('手动模式：未移入的留在 Today 与项目任务列表，不在 Logbook', async () => {
    at('MANUAL', '2026-10-09T00:00:00.000Z');
    expect(ids(await backend.getFeed('today'))).toEqual(['p-done', 't-done', 't-open']);
    expect(ids(await backend.getFeed('logbook'))).toEqual([]);
    expect(ids(await backend.getTasks({ projectId: 'p-open' }))).toEqual(['t-done', 't-open']);
  });

  it('Log Completed（水位线推进到现在）后进入 Logbook', async () => {
    at('MANUAL', NOW.toISOString());
    expect(ids(await backend.getFeed('today'))).toEqual(['t-open']);
    expect(ids(await backend.getFeed('logbook'))).toEqual(['p-done', 't-done']);
  });
});
