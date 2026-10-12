/**
 * Hide Later Items（隐藏稍后项）在设备 Engine 后端上的行为：新建默认显示、
 * 项目 / 区域各自切换，以及两台设备之间同步。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InMemorySyncHub, openEngine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';

import { createEngineAreaBackend } from './area-backend.engine';
import { createEngineProjectBackend } from './project-backend.engine';

const USER = 'user-1';

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

describe('Hide Later Items（Engine 后端）', () => {
  let hub: InMemorySyncHub;
  let a: Awaited<ReturnType<typeof open>>;
  let b: Awaited<ReturnType<typeof open>>;

  beforeEach(async () => {
    hub = new InMemorySyncHub();
    a = await open(hub, 'dev-a');
    b = await open(hub, 'dev-b');
  });

  afterEach(async () => {
    await a.engine.close();
    await b.engine.close();
  });

  it('新建的项目与区域默认显示稍后项', async () => {
    const project = await a.projects.createProject({ title: 'P' });
    const area = await a.areas.createArea({ title: 'A' });
    expect(project.hideLaterItems).toBe(false);
    expect(area.hideLaterItems).toBe(false);
  });

  it('切换后另一台设备同步到', async () => {
    const project = await a.projects.createProject({ title: 'P' });
    const area = await a.areas.createArea({ title: 'A' });

    expect(
      (await a.projects.updateProject(project.id, { hideLaterItems: true })).hideLaterItems,
    ).toBe(true);
    expect((await a.areas.updateArea(area.id, { hideLaterItems: true })).hideLaterItems).toBe(true);
    await a.engine.sync();
    await b.engine.sync();

    expect((await b.projects.getProject(project.id)).hideLaterItems).toBe(true);
    expect((await b.areas.getArea(area.id)).hideLaterItems).toBe(true);
  });
});
