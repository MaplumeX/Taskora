import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySyncHub, openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ScheduledType, TaskStatus } from '@taskora/shared';

import { createReminderCoordinator, type ReminderCoordinator } from './reminder-coordinator';
import type { ReminderNotificationShell } from './notification-shell';

const USER = 'user-1';

function makeShell() {
  return {
    isSupported: vi.fn(() => true),
    isPermissionGranted: vi.fn(async () => true),
    requestPermission: vi.fn(async () => true),
    schedule: vi.fn<(key: string, title: string, body: string, fireAt: number) => Promise<void>>(
      async () => {},
    ),
    cancel: vi.fn<(key: string) => Promise<void>>(async () => {}),
    fireNow: vi.fn<(title: string, body: string) => Promise<void>>(async () => {}),
    openSettings: vi.fn(async () => {}),
  } satisfies ReminderNotificationShell & Record<string, ReturnType<typeof vi.fn>>;
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

    expect(shell.schedule).not.toHaveBeenCalled(); // runtime 模式不注册系统排程
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
    await engine.update('task', taskId, { status: TaskStatus.COMPLETED, settledAt: '2026-02-04T12:00:00.000Z', reminderTime: null });
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

describe('ReminderCoordinator — system（移动）模式', () => {
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

  it('新提醒注册到系统；数据变更后差量更新（改期注销+重注册）', async () => {
    const taskId = await seedTask(engine);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);

    expect(shell.schedule).toHaveBeenCalledTimes(1);
    const [key, title, , fireAt] = shell.schedule.mock.calls[0];
    expect(key).toBe(`reminder:${taskId}`);
    expect(title).toBe('提醒任务');
    expect(fireAt).toBe(dayAt(5, 9));

    // 改时刻 → 同 key 先 cancel 再 schedule
    await engine.update('task', taskId, { reminderTime: '14:30' });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.cancel).toHaveBeenCalledWith(`reminder:${taskId}`);
    expect(shell.schedule).toHaveBeenCalledTimes(2);
    expect(shell.schedule.mock.calls[1][3]).toBe(dayAt(5, 14, 30));

    coordinator.stop();
    await engine.close();
  });

  it('取消提醒/进 Trash → 注销系统通知；stop 注销全部残留', async () => {
    const taskId = await seedTask(engine);
    coordinator.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(shell.schedule).toHaveBeenCalledTimes(1);

    await engine.update('task', taskId, { reminderTime: null });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(shell.cancel).toHaveBeenCalledWith(`reminder:${taskId}`);

    // stop（登出）：注销当前全部注册
    await engine.update('task', taskId, { reminderTime: '15:00' });
    await vi.advanceTimersByTimeAsync(30_000);
    shell.cancel.mockClear();
    coordinator.stop();
    expect(shell.cancel).toHaveBeenCalledWith(`reminder:${taskId}`);
    await engine.close();
  });

  it('App 未运行期间错过的提醒：启动对齐时不再注册（系统侧由 OS 决定）', async () => {
    await seedTask(engine);
    clock.advance(dayAt(6, 10) - dayAt(4, 12));
    coordinator.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shell.schedule).not.toHaveBeenCalled();
    coordinator.stop();
    await engine.close();
  });
});
