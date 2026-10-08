/**
 * Review（回顾）在设备 Engine 后端上的行为：新建对象的排期、标记已回顾、
 * 改间隔、待回顾判定、存量数据、队列排序与空状态信息、重复项目派生、
 * Put Back，以及两台设备并发标记已回顾后收敛。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySyncHub, openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ScheduledType, type ReviewInterval } from '@taskora/shared';

import { usePreferencesStore } from '@/stores/preferences.store';
import { createEngineAreaBackend } from './area-backend.engine';
import { createEngineProjectBackend } from './project-backend.engine';

const USER = 'user-1';
const WEEKLY: ReviewInterval = { unit: 'week', count: 1 };
const MONTHLY: ReviewInterval = { unit: 'month', count: 1 };

const initial = usePreferencesStore.getState();

async function open(hub: InMemorySyncHub, deviceId: string) {
  const engine = await openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId,
    transport: hub.transportFor(USER),
  });
  return {
    engine,
    projects: createEngineProjectBackend({ engine }),
    areas: createEngineAreaBackend({ engine }),
  };
}

/** 把账号时区的「现在」设为某天中午。 */
function setToday(day: string) {
  vi.setSystemTime(new Date(`${day}T12:00:00+08:00`));
}

describe('Review（Engine 后端）', () => {
  let hub: InMemorySyncHub;
  let device: Awaited<ReturnType<typeof open>>;
  let engine: Engine;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setToday('2026-03-10');
    usePreferencesStore.setState({
      timeZone: 'Asia/Shanghai',
      legacyDateTimeZone: 'Asia/Shanghai',
      defaultReviewInterval: WEEKLY,
    });
    hub = new InMemorySyncHub();
    device = await open(hub, 'dev-a');
    engine = device.engine;
  });

  afterEach(async () => {
    await engine.close();
    vi.useRealTimers();
    usePreferencesStore.setState({
      timeZone: initial.timeZone,
      legacyDateTimeZone: initial.legacyDateTimeZone,
      defaultReviewInterval: initial.defaultReviewInterval,
    });
  });

  it('新建 Project / Area：间隔取账号默认，下次回顾日为今天加间隔；显式传入以传入为准', async () => {
    usePreferencesStore.setState({ defaultReviewInterval: { unit: 'day', count: 3 } });
    const project = await device.projects.createProject({ title: 'P' });
    expect(project.reviewInterval).toEqual({ unit: 'day', count: 3 });
    expect(project.nextReviewDate).toBe('2026-03-13');

    const area = await device.areas.createArea({ title: 'A' });
    expect(area.reviewInterval).toEqual({ unit: 'day', count: 3 });
    expect(area.nextReviewDate).toBe('2026-03-13');

    const explicit = await device.projects.createProject({
      title: 'Q',
      reviewInterval: MONTHLY,
      nextReviewDate: '2026-05-01',
    });
    expect(explicit.reviewInterval).toEqual(MONTHLY);
    expect(explicit.nextReviewDate).toBe('2026-05-01');
  });

  it('标记已回顾：下次回顾日为今天加间隔，晚了才回顾也从今天重新计', async () => {
    const project = await device.projects.createProject({ title: 'P' });
    const area = await device.areas.createArea({ title: 'A' });
    setToday('2026-04-02'); // 早已过了 2026-03-17
    expect((await device.projects.markProjectReviewed(project.id)).nextReviewDate).toBe(
      '2026-04-09',
    );
    expect((await device.areas.markAreaReviewed(area.id)).nextReviewDate).toBe('2026-04-09');
  });

  it('加月遇到月末溢出取目标月最后一天', async () => {
    const project = await device.projects.createProject({ title: 'P', reviewInterval: MONTHLY });
    setToday('2026-01-31');
    expect((await device.projects.markProjectReviewed(project.id)).nextReviewDate).toBe(
      '2026-02-28',
    );
  });

  it('修改间隔不改写下次回顾日；可直接编辑下次回顾日', async () => {
    const project = await device.projects.createProject({ title: 'P' });
    const changed = await device.projects.updateProject(project.id, { reviewInterval: MONTHLY });
    expect(changed.reviewInterval).toEqual(MONTHLY);
    expect(changed.nextReviewDate).toBe('2026-03-17');
    const moved = await device.projects.updateProject(project.id, {
      nextReviewDate: '2026-06-01',
    });
    expect(moved.nextReviewDate).toBe('2026-06-01');

    const area = await device.areas.createArea({ title: 'A' });
    const areaChanged = await device.areas.updateArea(area.id, { reviewInterval: MONTHLY });
    expect(areaChanged.nextReviewDate).toBe('2026-03-17');
  });

  it('待回顾判定：含 Later Project，排除已了结与 Trash 中的项目，Area 始终参与', async () => {
    const due = { nextReviewDate: '2026-03-10' };
    const active = await device.projects.createProject({ title: 'active', ...due });
    const someday = await device.projects.createProject({
      title: 'someday',
      scheduledType: ScheduledType.SOMEDAY,
      ...due,
    });
    const later = await device.projects.createProject({
      title: 'later',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-09-01',
      ...due,
    });
    const done = await device.projects.createProject({ title: 'done', ...due });
    await device.projects.completeProject(done.id);
    const trashed = await device.projects.createProject({ title: 'trashed', ...due });
    await device.projects.deleteProject(trashed.id);
    const area = await device.areas.createArea({ title: 'area', ...due });
    await device.projects.createProject({ title: 'not yet' }); // 2026-03-17

    const queue = await device.projects.getReviewQueue();
    expect(new Set(queue.items.map((item) => item.id))).toEqual(
      new Set([active.id, someday.id, later.id, area.id]),
    );
  });

  it('存量数据（两个字段都为空）当作今天待回顾，标记时按默认间隔计算并固化间隔', async () => {
    const id = await engine.create('project', { title: 'legacy', status: 'ACTIVE' });
    const areaId = await engine.create('area', { title: 'legacy area' });
    const queue = await device.projects.getReviewQueue();
    expect(queue.items).toEqual(
      expect.arrayContaining([
        { kind: 'project', id },
        { kind: 'area', id: areaId },
      ]),
    );

    usePreferencesStore.setState({ defaultReviewInterval: { unit: 'day', count: 10 } });
    const marked = await device.projects.markProjectReviewed(id);
    expect(marked.reviewInterval).toEqual({ unit: 'day', count: 10 });
    expect(marked.nextReviewDate).toBe('2026-03-20');
  });

  it('队列排序：按下次回顾日升序，同一天按侧边栏顺序（项目紧跟所属 Area）', async () => {
    const day = (nextReviewDate: string) => ({ nextReviewDate });
    const areaA = await device.areas.createArea({ title: 'A', ...day('2026-03-08') });
    const loose = await device.projects.createProject({ title: 'loose', ...day('2026-03-08') });
    const inA = await device.projects.createProject({
      title: 'in A',
      areaId: areaA.id,
      ...day('2026-03-08'),
    });
    const older = await device.projects.createProject({ title: 'older', ...day('2026-03-01') });
    const areaB = await device.areas.createArea({ title: 'B', ...day('2026-03-08') });
    const today = await device.projects.createProject({ title: 'today', ...day('2026-03-10') });

    const queue = await device.projects.getReviewQueue();
    // 侧边栏顺序：loose、A、in A、older、today、B（无项目锚定的 Area 在末尾）
    expect(queue.items).toEqual([
      { kind: 'project', id: older.id },
      { kind: 'project', id: loose.id },
      { kind: 'area', id: areaA.id },
      { kind: 'project', id: inA.id },
      { kind: 'area', id: areaB.id },
      { kind: 'project', id: today.id },
    ]);
  });

  it('待回顾数即队列长度；空状态给出下一次回顾日及当天数量', async () => {
    expect(await device.projects.getReviewQueue()).toEqual({ items: [], upcoming: null });

    await device.projects.createProject({ title: 'a' }); // 2026-03-17
    await device.areas.createArea({ title: 'b' }); // 2026-03-17
    await device.projects.createProject({ title: 'c', nextReviewDate: '2026-03-12' });
    await device.projects.createProject({ title: 'd', nextReviewDate: '2026-03-12' });
    await device.projects.createProject({ title: 'e', nextReviewDate: '2026-03-10' });

    const queue = await device.projects.getReviewQueue();
    expect(queue.items).toHaveLength(1);
    expect(queue.upcoming).toEqual({ date: '2026-03-12', count: 2 });
  });

  it('派生 Repeat Project Instance：沿用来源间隔，下次回顾日为派生日加间隔', async () => {
    const project = await device.projects.createProject({
      title: 'weekly',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-03-10',
      reviewInterval: MONTHLY,
      nextReviewDate: '2026-03-01',
    });
    await device.projects.updateProject(project.id, {
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    setToday('2026-03-11');
    await device.projects.completeProject(project.id);
    const [instance] = await engine.list('project', { where: { repeatSourceId: project.id } });
    const dto = await device.projects.getProject(instance.id);
    expect(dto.reviewInterval).toEqual(MONTHLY);
    expect(dto.nextReviewDate).toBe('2026-04-11');
  });

  it('Put Back 与了结都不改动回顾字段', async () => {
    const project = await device.projects.createProject({
      title: 'P',
      reviewInterval: MONTHLY,
      nextReviewDate: '2026-04-01',
    });
    await device.projects.deleteProject(project.id);
    const restored = await device.projects.restoreProject(project.id);
    expect(restored.reviewInterval).toEqual(MONTHLY);
    expect(restored.nextReviewDate).toBe('2026-04-01');
    const completed = await device.projects.completeProject(project.id);
    expect(completed.nextReviewDate).toBe('2026-04-01');
  });

  it('两台设备并发标记已回顾，同步后收敛', async () => {
    const project = await device.projects.createProject({ title: 'P', nextReviewDate: '2026-03-01' });
    await engine.sync();
    const other = await open(hub, 'dev-b');
    try {
      await other.engine.sync();
      await other.projects.updateProject(project.id, { reviewInterval: MONTHLY });
      await device.projects.markProjectReviewed(project.id);
      await other.projects.markProjectReviewed(project.id);
      await engine.sync();
      await other.engine.sync();
      await engine.sync();
      const a = await device.projects.getProject(project.id);
      const b = await other.projects.getProject(project.id);
      expect(a.nextReviewDate).toBe(b.nextReviewDate);
      expect(a.reviewInterval).toEqual(b.reviewInterval);
      expect(await device.projects.getReviewQueue()).toEqual(
        await other.projects.getReviewQueue(),
      );
    } finally {
      await other.engine.close();
    }
  });
});
