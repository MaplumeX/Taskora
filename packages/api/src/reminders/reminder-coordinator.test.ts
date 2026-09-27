import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySyncHub, openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ScheduledType, TaskStatus } from '@taskora/shared';

import { usePreferencesStore } from '@/stores/preferences.store';
import { createReminderCoordinator, type ReminderCoordinator } from './reminder-coordinator';
import type { ReminderDelivery, ReminderNotificationShell } from './notification-shell';

const USER = 'user-1';

function makeShell() {
  return {
    isSupported: vi.fn(() => true),
    isPermissionGranted: vi.fn(async () => true),
    requestPermission: vi.fn(async () => true),
    fireNow: vi.fn<(title: string, body: string) => Promise<void>>(async () => {}),
    sync: vi.fn<(plan: ReminderDelivery[]) => Promise<void>>(async () => {}),
    clear: vi.fn<() => Promise<void>>(async () => {}),
    openSettings: vi.fn(async () => {}),
  } satisfies ReminderNotificationShell & Record<string, ReturnType<typeof vi.fn>>;
}

/** 最近一次交付给原生的完整期望集。 */
function lastPlan(shell: ReturnType<typeof makeShell>): ReminderDelivery[] | undefined {
  return shell.sync.mock.calls.at(-1)?.[0];
}

/** 可控时钟：nowMs 手动推进。 */
function makeClock(startMs: number) {
  let current = startMs;
  return {
    now: () => new Date(current),
    advance: (ms: number) => (current += ms),
  };
}

async function makeEngine(): Promise<Engine> {
  return openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: 'dev-reminder-coordinator',
    transport: new InMemorySyncHub().transportFor(USER),
  });
}

/** 2026-02-05（周四）09:00 本地时刻的 epoch ms。 */
const dayAt = (day: number, hh = 9, mm = 0) => new Date(2026, 1, day, hh, mm, 0).getTime();

async function seedTask(
  engine: Engine,
  partial: { id?: string; title?: string; day?: number; time?: string | null } = {},
) {
  const id = await engine.create('task', {
    title: partial.title ?? '提醒任务',
    notes: null,
    scheduledDate: `2026-02-${String(partial.day ?? 5).padStart(2, '0')}`,
    scheduledType: ScheduledType.DATE,
    reminderTime: partial.time === undefined ? '09:00' : partial.time,
    dueDate: null,
    bucket: 'SCHEDULED',
    status: TaskStatus.ACTIVE,
    settledAt: null,
    trashedAt: null,
    position: 'a0',
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    tagIds: [],
  });
  return id;
}

describe('ReminderCoordinator — runtime（桌面）模式', () => {
  let engine: Engine;
  let shell: ReturnType<typeof makeShell>;
  let clock: ReturnType<typeof makeClock>;
  let coordinator: ReminderCoordinator;

  beforeEach(async () => {
    vi.useFakeTimers();
    engine = await makeEngine();
    shell = makeShell();
    clock = makeClock(dayAt(4, 12)); // 2月4日 12:00
    coordinator = createReminderCoordinator({
      engine,
      shell,
      mode: 'runtime',
      tickMs: 30_000,
      now: clock.now,
    });
  });

  it('开启提醒后到点 fireNow；随后不再重复触发', async () => {
    await seedTask(engine);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10); // 首次对齐 reschedule

    expect(shell.sync).not.toHaveBeenCalled(); // runtime 模式不交付系统计划
    // 推进到 2月5日 08:59 + tick
    clock.advance(dayAt(5, 8, 59) - dayAt(4, 12));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.fireNow).not.toHaveBeenCalled();

    clock.advance(60_000); // 09:00
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.fireNow).toHaveBeenCalledTimes(1);
    expect(shell.fireNow).toHaveBeenCalledWith('提醒任务', '09:00');

    // 再过数分钟不重复
    clock.advance(120_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.fireNow).toHaveBeenCalledTimes(1);

    coordinator.stop();
    await engine.close();
  });

  it('了结/关提醒后不再触发；日期变更保留时刻但改到新日期触发', async () => {
    const taskId = await seedTask(engine);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);

    // 完成任务 → 提醒消失
    await engine.update('task', taskId, {
      status: TaskStatus.COMPLETED,
      settledAt: '2026-02-04T12:00:00.000Z',
      reminderTime: null,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    clock.advance(dayAt(5, 9, 1) - dayAt(4, 12));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.fireNow).not.toHaveBeenCalled();
    coordinator.stop();
    await engine.close();
  });

  it('App 未运行期间错过的提醒不补发：启动时已过期则静默丢弃', async () => {
    await seedTask(engine); // 2月5日 09:00
    // 启动时刻 = 2月6日（已错过）
    clock.advance(dayAt(6, 10) - dayAt(4, 12));
    coordinator.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shell.fireNow).not.toHaveBeenCalled();
    coordinator.stop();
    await engine.close();
  });

  it('到点之后才了结：不补发已完结工作的提醒（spec story 7）', async () => {
    const taskId = await seedTask(engine); // 2月5日 09:00
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);

    // 到点（错过 tick 边界）之后、下个 tick 之前完结任务
    clock.advance(dayAt(5, 9, 0) - dayAt(4, 12) + 5_000);
    await engine.update('task', taskId, {
      status: TaskStatus.COMPLETED,
      settledAt: new Date(clock.now()).toISOString(),
      reminderTime: null,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.fireNow).not.toHaveBeenCalled();
    coordinator.stop();
    await engine.close();
  });

  it('到点后改期：同 key 改期注销不补发旧时刻（用户意图是新时刻）', async () => {
    const taskId = await seedTask(engine); // 2月5日 09:00
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);

    // 到点之后把提醒改到当天更晚
    clock.advance(dayAt(5, 9, 0) - dayAt(4, 12) + 5_000);
    await engine.update('task', taskId, { reminderTime: '15:00' });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.fireNow).not.toHaveBeenCalled();

    // 新时刻到点后正常触发（当前时刻 = 09:00:05）
    clock.advance(dayAt(5, 15, 0) - (dayAt(5, 9, 0) + 5_000));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shell.fireNow).toHaveBeenCalledTimes(1);
    expect(shell.fireNow).toHaveBeenCalledWith('提醒任务', '15:00');
    coordinator.stop();
    await engine.close();
  });
});

describe('ReminderCoordinator — system（Android）模式', () => {
  let engine: Engine;
  let shell: ReturnType<typeof makeShell>;
  let clock: ReturnType<typeof makeClock>;
  let coordinator: ReminderCoordinator;

  beforeEach(async () => {
    vi.useFakeTimers();
    engine = await makeEngine();
    shell = makeShell();
    clock = makeClock(dayAt(4, 12));
    coordinator = createReminderCoordinator({
      engine,
      shell,
      mode: 'system',
      tickMs: 30_000,
      now: clock.now,
    });
  });

  it('启动时交付完整期望集；数据变更后再次交付完整集（非增量）', async () => {
    const taskId = await seedTask(engine);
    const otherId = await seedTask(engine, { title: '另一个', day: 6, time: '10:30' });
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);

    expect(lastPlan(shell)).toEqual(
      expect.arrayContaining([
        { key: `reminder:${taskId}`, fireAt: dayAt(5, 9), title: '提醒任务', body: '09:00' },
        { key: `reminder:${otherId}`, fireAt: dayAt(6, 10, 30), title: '另一个', body: '10:30' },
      ]),
    );
    expect(lastPlan(shell)).toHaveLength(2);

    await engine.update('task', taskId, { reminderTime: '14:30' });
    await vi.advanceTimersByTimeAsync(10);
    expect(lastPlan(shell)).toHaveLength(2);
    expect(lastPlan(shell)).toContainEqual({
      key: `reminder:${taskId}`,
      fireAt: dayAt(5, 14, 30),
      title: '提醒任务',
      body: '14:30',
    });
    expect(shell.fireNow).not.toHaveBeenCalled();

    coordinator.stop();
    await engine.close();
  });

  it('期望集未变时周期 tick 不重复交付；标题变更会重新交付', async () => {
    const taskId = await seedTask(engine);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(shell.sync).toHaveBeenCalledTimes(1);

    await engine.update('task', taskId, { title: '改名后' });
    await vi.advanceTimersByTimeAsync(10);
    expect(shell.sync).toHaveBeenCalledTimes(2);
    expect(lastPlan(shell)?.[0].title).toBe('改名后');

    coordinator.stop();
    await engine.close();
  });

  it('关提醒 / 了结 / 进 Trash → 从期望集中消失', async () => {
    const a = await seedTask(engine, { title: 'A' });
    const b = await seedTask(engine, { title: 'B' });
    const c = await seedTask(engine, { title: 'C' });
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(lastPlan(shell)).toHaveLength(3);

    await engine.update('task', a, { reminderTime: null });
    await engine.update('task', b, {
      status: TaskStatus.COMPLETED,
      settledAt: '2026-02-04T12:00:00.000Z',
    });
    await engine.update('task', c, { trashedAt: '2026-02-04T12:00:00.000Z' });
    await vi.advanceTimersByTimeAsync(10);
    expect(lastPlan(shell)).toEqual([]);

    coordinator.stop();
    await engine.close();
  });

  it('自然到点后提醒从期望集消失（在途投递由原生保留），且不走 fireNow', async () => {
    await seedTask(engine);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(lastPlan(shell)).toHaveLength(1);

    clock.advance(dayAt(5, 9, 0) - dayAt(4, 12) + 1_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lastPlan(shell)).toEqual([]);
    expect(shell.fireNow).not.toHaveBeenCalled();
    expect(shell.clear).not.toHaveBeenCalled();

    coordinator.stop();
    await engine.close();
  });

  it('启动时已错过的提醒不进入期望集（不补发）', async () => {
    await seedTask(engine);
    clock.advance(dayAt(6, 10) - dayAt(4, 12));
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(lastPlan(shell)).toEqual([]);
    coordinator.stop();
    await engine.close();
  });

  it('stop（登出）清空原生计划', async () => {
    await seedTask(engine);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    coordinator.stop();
    expect(shell.clear).toHaveBeenCalledTimes(1);
    await engine.close();
  });

  it('交付失败不记账：下个 tick 以同一期望集重试，成功后不再重复', async () => {
    await seedTask(engine);
    shell.sync.mockRejectedValueOnce(new Error('plugin unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(shell.sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.sync).toHaveBeenCalledTimes(2);
    expect(shell.sync.mock.calls[1][0]).toEqual(shell.sync.mock.calls[0][0]);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.sync).toHaveBeenCalledTimes(2);

    warn.mockRestore();
    coordinator.stop();
    await engine.close();
  });

  it('账号时区修改立即按新时区交付，不误补发', async () => {
    const previous = usePreferencesStore.getState().timeZone;
    usePreferencesStore.getState().setTimeZone('Asia/Shanghai');
    const localEngine = await makeEngine();
    const localShell = makeShell();
    const localCoordinator = createReminderCoordinator({
      engine: localEngine,
      shell: localShell,
      mode: 'system',
      now: () => new Date('2026-02-04T00:00Z'),
    });
    try {
      await seedTask(localEngine);
      localCoordinator.start();
      await localCoordinator.reschedule();
      expect(lastPlan(localShell)?.[0].fireAt).toBe(Date.parse('2026-02-05T01:00Z'));
      usePreferencesStore.getState().setTimeZone('America/New_York');
      await localCoordinator.reschedule();
      expect(lastPlan(localShell)?.[0].fireAt).toBe(Date.parse('2026-02-05T14:00Z'));
      expect(lastPlan(localShell)?.[0].body).toBe('09:00');
      expect(localShell.fireNow).not.toHaveBeenCalled();
    } finally {
      localCoordinator.stop();
      await localEngine.close();
      usePreferencesStore.getState().setTimeZone(previous);
    }
  });
});
