/**
 * 多标签页共享一个副本：真实 BroadcastChannel（Node 全局）+ 真实 Engine
 * （node:sqlite）。leader 执行、其余标签页代理；换 leader 时未完成的调用
 * 重发且不重复写。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { InMemorySyncHub, openEngine, type Engine, type EngineChange } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';

import { createEngineHost, TabEngine, type TabChannel } from './tab-engine';

const CHANNEL = 'taskora-engine:test';

describe('TabEngine（多标签页）', () => {
  const channels: BroadcastChannel[] = [];
  const openChannel = (): TabChannel => {
    const channel = new BroadcastChannel(CHANNEL);
    channels.push(channel);
    return channel as unknown as TabChannel;
  };
  afterEach(() => {
    channels.splice(0).forEach((channel) => channel.close());
  });

  async function newEngine(): Promise<Engine> {
    return openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'web-device',
      transport: new InMemorySyncHub().transportFor('u'),
    });
  }

  /** 让一个标签页成为 leader：host 服务其它标签页，本标签页走本地执行器。 */
  function lead(tab: TabEngine, channel: TabChannel, engine: Engine, id: string, overrides = {}) {
    const host = createEngineHost(channel, engine, id, overrides);
    engine.onChange((change) => {
      tab.emitChange(change);
      host.broadcastChange(change);
    });
    tab.becomeLeader(host.execute);
    return host;
  }

  it('其它标签页的读写经 leader 执行，变更通知所有标签页', async () => {
    const engine = await newEngine();
    const leaderChannel = openChannel();
    const leaderTab = new TabEngine(leaderChannel, 'web-device');
    lead(leaderTab, leaderChannel, engine, 'A');
    const follower = new TabEngine(openChannel(), 'web-device');

    const followerChanges: EngineChange[] = [];
    const leaderChanges: EngineChange[] = [];
    follower.onChange((change) => followerChanges.push(change));
    leaderTab.onChange((change) => leaderChanges.push(change));

    const id = await follower.create('task', { title: '从另一个标签页写' });
    expect((await engine.get('task', id))?.fields.title).toBe('从另一个标签页写');
    expect((await follower.get('task', id))?.fields.title).toBe('从另一个标签页写');
    expect((await leaderTab.list('task')).map((row) => row.id)).toEqual([id]);
    expect(await follower.pendingCount()).toBe(await engine.pendingCount());

    await expect.poll(() => followerChanges.length).toBeGreaterThan(0);
    expect(followerChanges[0]).toMatchObject({ origin: 'local', entities: ['task'] });
    expect(leaderChanges.length).toBe(followerChanges.length);
  });

  it('leader 上任前的调用先挂起，hello 后发出', async () => {
    const follower = new TabEngine(openChannel(), 'web-device');
    const created = follower.create('task', { title: '早到的写' });

    const engine = await newEngine();
    const leaderChannel = openChannel();
    lead(new TabEngine(leaderChannel, 'web-device'), leaderChannel, engine, 'A');

    const id = await created;
    expect((await engine.get('task', id))?.fields.title).toBe('早到的写');
  });

  it('leader 中途消失：未完成的调用重发给新 leader；create 的 id 由调用方定，不会重复建行', async () => {
    const engine = await newEngine();
    // 第一个 leader 收到调用后就「关闭了标签页」：执行但不回结果
    const deadChannel = openChannel();
    const deadTab = new TabEngine(deadChannel, 'web-device');
    const deadHost = lead(deadTab, deadChannel, engine, 'A', {
      create: async (entity: unknown, values: unknown) => {
        await engine.create(entity as 'task', values as Record<string, unknown>);
        deadHost.stop();
        return new Promise(() => undefined);
      },
    });

    const follower = new TabEngine(openChannel(), 'web-device');
    const created = follower.create('task', { title: '跨越换届的写' });
    await expect.poll(async () => (await engine.list('task')).length).toBe(1);

    // 新 leader 上任（同一个副本），hello → 重发
    const nextChannel = openChannel();
    lead(new TabEngine(nextChannel, 'web-device'), nextChannel, engine, 'B');

    const id = await created;
    const rows = await engine.list('task');
    expect(rows.map((row) => row.id)).toEqual([id]);
    expect(rows[0].fields.title).toBe('跨越换届的写');
  });

  it('自己成为 leader 时，挂起的调用改在本地执行', async () => {
    const channel = openChannel();
    const tab = new TabEngine(channel, 'web-device');
    const created = tab.create('task', { title: '本地执行' });
    const engine = await newEngine();
    lead(tab, channel, engine, 'A');
    const id = await created;
    expect((await engine.get('task', id))?.fields.title).toBe('本地执行');
  });

  it('leader 的错误带名字传回；状态与不可用通知广播给其它标签页', async () => {
    const engine = await newEngine();
    const leaderChannel = openChannel();
    const host = lead(new TabEngine(leaderChannel, 'web-device'), leaderChannel, engine, 'A', {
      sync: async () => {
        const error = new Error('hub 要求升级');
        error.name = 'SyncUpgradeRequiredError';
        throw error;
      },
    });
    const follower = new TabEngine(openChannel(), 'web-device');

    const failure = await follower.sync().catch((error: Error) => error);
    expect(failure).toMatchObject({ name: 'SyncUpgradeRequiredError', message: 'hub 要求升级' });

    const statuses: Array<[string, number]> = [];
    const unavailable: string[] = [];
    follower.onStatus((status, count) => statuses.push([status, count]));
    follower.onUnavailable((reason) => unavailable.push(reason));
    host.broadcastStatus('offline', 3);
    host.broadcastUnavailable('upgrade-required');
    await expect.poll(() => unavailable).toEqual(['upgrade-required']);
    expect(statuses).toEqual([['offline', 3]]);
  });
});
