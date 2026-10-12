/**
 * 多窗口（ADR-0025）：主窗口的 Engine 经窗口通道服务副窗口的 TabEngine。
 * Tauri 事件换成内存总线（载荷经 JSON 往返，与 IPC 序列化一致），Engine
 * 为真实实现（node:sqlite）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setSyncStatus, TabEngine, type TabMessage } from '@taskora/api';
import { InMemorySyncHub, openEngine, type Engine, type EngineChange } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';

const bus = vi.hoisted(() => {
  const handlers = new Map<string, Set<(event: { payload: unknown }) => void>>();
  return {
    handlers,
    listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
      const set = handlers.get(name) ?? new Set();
      set.add(handler);
      handlers.set(name, set);
      return () => set.delete(handler);
    }),
    emit: vi.fn(async (name: string, payload: unknown) => {
      const wire = JSON.parse(JSON.stringify(payload)) as unknown;
      setTimeout(() => handlers.get(name)?.forEach((handler) => handler({ payload: wire })));
    }),
  };
});

vi.mock('@tauri-apps/api/event', () => ({ listen: bus.listen, emit: bus.emit }));
vi.mock('../engine/tauri-storage', () => ({ isTauriRuntime: () => true }));

const { initWindowHost, serveEngine, stopServing } = await import('./engine-host');
const { createWindowChannel, decodeMessage, encodeMessage } = await import('./window-channel');

async function newEngine(): Promise<Engine> {
  return openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: 'desktop-device',
    transport: new InMemorySyncHub().transportFor('u'),
  });
}

const windows: TabEngine[] = [];
function openSecondary(label = `window-${windows.length + 1}`): TabEngine {
  const tab = new TabEngine(createWindowChannel(label), 'desktop-device');
  windows.push(tab);
  return tab;
}

afterEach(async () => {
  stopServing();
  await Promise.all(windows.splice(0).map((tab) => tab.close()));
  setSyncStatus('idle');
});

describe('多窗口：副窗口经主窗口的 Engine 读写', () => {
  it('读写在主窗口执行，主窗口的变更通知副窗口', async () => {
    const engine = await newEngine();
    initWindowHost();
    serveEngine(engine, async () => undefined);
    const secondary = openSecondary();
    const changes: EngineChange[] = [];
    secondary.onChange((change) => changes.push(change));

    const id = await secondary.create('task', { title: '副窗口写的' });
    expect((await engine.get('task', id))?.fields.title).toBe('副窗口写的');
    expect((await secondary.list('task')).map((row) => row.id)).toEqual([id]);

    await engine.update('task', id, { title: '主窗口改的' });
    await vi.waitFor(() =>
      expect(changes.some((change) => change.ids?.task?.includes(id))).toBe(true),
    );
    expect((await secondary.get('task', id))?.fields.title).toBe('主窗口改的');
  });

  it('Engine 就绪前打开的副窗口：调用挂起，主窗口上任后执行', async () => {
    initWindowHost();
    const secondary = openSecondary();
    const created = secondary.create('task', { title: '早到的写' });

    const engine = await newEngine();
    serveEngine(engine, async () => undefined);
    const id = await created;
    expect((await engine.list('task')).map((row) => row.id)).toEqual([id]);
  });

  it('副窗口的 sync 走主窗口的同步调度；同步状态广播给副窗口', async () => {
    const engine = await newEngine();
    const sync = vi.fn(async () => true);
    initWindowHost();
    serveEngine(engine, sync);
    const secondary = openSecondary();
    const statuses: string[] = [];
    secondary.onStatus((status, pendingCount) => statuses.push(`${status}:${pendingCount}`));

    await secondary.sync();
    expect(sync).toHaveBeenCalledOnce();

    setSyncStatus('offline', 2);
    await vi.waitFor(() => expect(statuses).toContain('offline:2'));
  });

  it('主窗口的副本不可用：已开的与之后打开的副窗口都收到 unavailable', async () => {
    initWindowHost();
    const before = openSecondary();
    const beforeReasons: string[] = [];
    before.onUnavailable((reason) => beforeReasons.push(reason));
    // 等 ping 发出，副窗口已在线
    await vi.waitFor(() => expect(bus.emit).toHaveBeenCalled());

    stopServing('upgrade-required');
    // 广播与对 ping 的应答可能各到一次（副窗口侧只退回一次）
    await vi.waitFor(() => expect(beforeReasons[0]).toBe('upgrade-required'));

    const after = openSecondary();
    const afterReasons: string[] = [];
    after.onUnavailable((reason) => afterReasons.push(reason));
    await vi.waitFor(() => expect(afterReasons).toEqual(['upgrade-required']));
  });
});

describe('窗口通道编码', () => {
  it('参数数组里的 undefined 经 JSON 往返仍是 undefined，null 保持 null', () => {
    const message = {
      kind: 'call',
      callId: 'c1',
      method: 'list',
      args: ['task', undefined, null, { where: { projectId: null }, limit: undefined }],
    } satisfies TabMessage;
    const decoded = decodeMessage(JSON.parse(JSON.stringify(encodeMessage(message))) as string);
    expect(decoded).toEqual({
      kind: 'call',
      callId: 'c1',
      method: 'list',
      args: ['task', undefined, null, { where: { projectId: null } }],
    });
    expect((decoded as { args: unknown[] }).args).toHaveLength(4);
  });
});
