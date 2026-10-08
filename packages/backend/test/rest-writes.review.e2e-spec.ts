/**
 * Review（回顾）的 hub 写路径（真实 Postgres + 真实 Sync Hub）：新建对象的
 * 回顾排期（跟随默认）、REST 改间隔 / 下次回顾日与标记已回顾（以下次回顾日
 * 为锚点、记上次回顾日）、设备推送的回顾字段，
 * 以及结构不合法的 reviewInterval 被剔除并以必胜时钟下发空值。
 */
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import { compareHlc, formatHlc } from '@taskora/engine';

import { disconnectTestDb, testPrisma } from './db';
import {
  createHarness,
  dbDescribe,
  expectLoggedAsStored,
  lastLoggedState,
  USER,
} from './rest-writes.harness';

type Harness = Awaited<ReturnType<typeof createHarness>>;

const stamp = (counter: number) =>
  formatHlc({ wallMs: Date.now() + 60_000, counter, deviceId: 'dev-review' });

dbDescribe('Review 写路径（真实 Postgres）', () => {
  let h: Harness;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
    h = await createHarness();
    await testPrisma.user.update({
      where: { id: USER },
      data: {
        preferences: {
          timeZone: 'UTC',
          defaultReviewIntervals: {
            project: { unit: 'day', count: 3 },
            area: { unit: 'day', count: 5 },
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('REST 新建 Project / Area：按对象类型写入默认间隔，下次回顾日为今天加间隔', async () => {
    const project = await h.projects.create(USER, { title: 'P' });
    expect(project.reviewInterval).toEqual({ unit: 'day', count: 3 });
    expect(project.nextReviewDate?.toISOString()).toBe('2026-03-13T00:00:00.000Z');
    expect(project.lastReviewedOn).toBeNull();
    await expectLoggedAsStored('project', project.id);

    const area = await h.areas.create(USER, { title: 'A' });
    expect(area.reviewInterval).toEqual({ unit: 'day', count: 5 });
    expect(area.nextReviewDate?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect((await lastLoggedState('area', area.id))?.fields.reviewInterval).toEqual({
      unit: 'day',
      count: 5,
    });
  });

  it('REST 改间隔不改写下次回顾日；标记已回顾从原下次回顾日加间隔并记上次回顾日', async () => {
    const project = await h.projects.create(USER, { title: 'P' });
    const changed = await h.projects.update(USER, project.id, {
      reviewInterval: { unit: 'month', count: 1 },
    });
    expect(changed.reviewInterval).toEqual({ unit: 'month', count: 1 });
    expect(changed.nextReviewDate?.toISOString()).toBe('2026-03-13T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
    const marked = await h.projects.markReviewed(USER, project.id);
    expect(marked.nextReviewDate?.toISOString()).toBe('2026-04-13T00:00:00.000Z');
    expect(marked.lastReviewedOn?.toISOString()).toBe('2026-03-31T00:00:00.000Z');
    await expectLoggedAsStored('project', project.id);

    const area = await h.areas.create(USER, { title: 'A' });
    await h.areas.update(USER, area.id, { nextReviewDate: '2026-03-20' });
    const areaMarked = await h.areas.markReviewed(USER, area.id);
    expect(areaMarked.nextReviewDate?.toISOString()).toBe('2026-04-04T00:00:00.000Z');
    expect(areaMarked.lastReviewedOn?.toISOString()).toBe('2026-03-31T00:00:00.000Z');
    await expectLoggedAsStored('area', area.id);
  });

  it('设备推送的回顾字段经同步落库', async () => {
    await h.hub.push(USER, [
      {
        entity: 'area',
        id: 'area-device',
        // 与 LocalReplica 的新建一致：全字段 create
        fields: {
          title: { value: '设备区域', hlc: stamp(1) },
          notes: { value: null, hlc: stamp(1) },
          position: { value: 'a0', hlc: stamp(1) },
          tagIds: { value: [], hlc: stamp(1) },
          reviewInterval: { value: { unit: 'year', count: 1 }, hlc: stamp(1) },
          nextReviewDate: { value: '2026-12-01', hlc: stamp(1) },
          lastReviewedOn: { value: '2026-03-09', hlc: stamp(1) },
          createdAt: { value: '2026-03-10T12:00:00.000Z', hlc: stamp(1) },
          updatedAt: { value: '2026-03-10T12:00:00.000Z', hlc: stamp(1) },
        },
      },
    ]);
    const area = await h.areas.findOne(USER, 'area-device');
    expect(area.reviewInterval).toEqual({ unit: 'year', count: 1 });
    expect(area.nextReviewDate?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(area.lastReviewedOn?.toISOString()).toBe('2026-03-09T00:00:00.000Z');
  });

  it('结构不合法的 reviewInterval 被剔除：落库为空，并以必胜时钟下发空值', async () => {
    const project = await h.projects.create(USER, { title: 'P' });
    const pushed = stamp(10);
    await h.hub.push(USER, [
      {
        entity: 'project',
        id: project.id,
        fields: { reviewInterval: { value: { unit: 'decade', count: 0 }, hlc: pushed } },
      },
    ]);
    const row = await testPrisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(row.reviewInterval).toBeNull();
    const logged = await lastLoggedState('project', project.id);
    expect(logged?.fields.reviewInterval).toBeNull();
    expect(compareHlc(logged!.clocks.reviewInterval, pushed)).toBeGreaterThan(0);
    // 读路径给出空值（客户端按默认间隔计算）
    expect((await h.projects.findOne(USER, project.id)).reviewInterval).toBeNull();
  });
});
