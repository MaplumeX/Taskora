import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemorySyncHub, openEngine, deriveRepeatInstanceId } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ScheduledType } from '@taskora/shared';
import { usePreferencesStore } from '@/stores/preferences.store';
import { createEngineTaskBackend } from './task-backend.engine';
import { createEngineProjectBackend } from './project-backend.engine';

const initial = usePreferencesStore.getState();
afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({
    timeZone: initial.timeZone,
    legacyDateTimeZone: initial.legacyDateTimeZone,
  });
});

describe('账号时区 Engine 行为', () => {
  it('今天完成每日任务：下一实例为明天，Today 不再包含它；任务与项目一致', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T17:00Z'));
    usePreferencesStore.setState({
      timeZone: 'Asia/Shanghai',
      legacyDateTimeZone: 'Asia/Shanghai',
    });
    const engine = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'tz-device',
      transport: new InMemorySyncHub().transportFor('u'),
    });
    try {
      const tasks = createEngineTaskBackend({ engine });
      const projects = createEngineProjectBackend({ engine });
      const rule = { unit: 'day', interval: 1, anchor: 'scheduled' } as const;
      const parent = await tasks.createTask({
        title: '浇花',
        scheduledType: ScheduledType.DATE,
        scheduledDate: '2026-09-24',
      });
      await tasks.updateTask(parent.id, { repeatRule: rule });
      await tasks.completeTask(parent.id);
      const expectedId = deriveRepeatInstanceId(parent.id, rule, '2026-09-25');
      expect((await tasks.getTask(expectedId)).scheduledDate).toBe('2026-09-25');
      expect((await tasks.getFeed('today')).map((t) => t.id)).not.toContain(expectedId);
      expect((await tasks.getFeed('upcoming')).map((t) => t.id)).toContain(expectedId);
      const project = await projects.createProject({
        title: '项目',
        scheduledType: ScheduledType.DATE,
        scheduledDate: '2026-09-24',
      });
      expect((await tasks.getFeed('today')).map((t) => t.id)).toContain(project.id);
      // The REST UTC-midnight encoding must have exactly the same result.
      await engine.update('task', parent.id, {
        status: 'ACTIVE',
        scheduledDate: '2026-09-24T00:00:00.000Z',
      });
      expect((await tasks.getFeed('today')).map((t) => t.id)).toContain(parent.id);
      await tasks.updateTask(parent.id, { repeatRule: { ...rule, anchor: 'completion' } });
      await tasks.completeTask(parent.id);
      const completionId = deriveRepeatInstanceId(
        parent.id,
        { ...rule, anchor: 'completion' },
        '2026-09-25',
      );
      expect((await tasks.getTask(completionId)).scheduledDate).toBe('2026-09-25');
    } finally {
      await engine.close();
    }
  });
});
