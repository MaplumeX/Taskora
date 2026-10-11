/**
 * Undo 在真实设备 Engine 上的行为：一步 = 两次用户输入之间的全部写入，
 * 逆序回写旧值；新建的条目被删除；不可还原的物理删除清空历史。
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySyncHub, openEngine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ScheduledType, TaskStatus } from '@taskora/shared';

import { createEngineAreaBackend } from '../engine/area-backend.engine';
import { createEngineTaskBackend } from '../engine/task-backend.engine';
import { UndoHistory, installUndoBoundaries } from './undo-history';

async function open() {
  const hub = new InMemorySyncHub();
  const raw = await openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: 'dev-test',
    transport: hub.transportFor('user-1'),
  });
  const history = new UndoHistory();
  const engine = history.attach(raw);
  return {
    raw,
    history,
    tasks: createEngineTaskBackend({ engine }),
    areas: createEngineAreaBackend({ engine }),
    rawTasks: createEngineTaskBackend({ engine: raw }),
  };
}

describe('UndoHistory', () => {
  let device: Awaited<ReturnType<typeof open>>;

  beforeEach(async () => {
    device = await open();
  });

  it('撤销一次改期：回到原计划，动作名为 schedule', async () => {
    const { history, tasks, rawTasks } = device;
    const task = await tasks.createTask({ title: '写周报' });
    history.boundary();
    await tasks.updateTask(task.id, {
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2030-01-07',
    });

    expect(await history.peek()).toBe('schedule');
    expect(await history.undo()).toBe('schedule');
    const after = await rawTasks.getTask(task.id);
    expect(after.scheduledType).toBe(ScheduledType.NONE);
    expect(after.scheduledDate).toBeNull();
    // 再撤销一步：新建的任务被删除。
    expect(await history.undo()).toBe('create');
    await expect(rawTasks.getTask(task.id)).rejects.toThrow();
    expect(await history.undo()).toBeNull();
  });

  it('同一次输入里的批量写入合成一步', async () => {
    const { history, tasks, rawTasks } = device;
    const a = await tasks.createTask({ title: 'A' });
    const b = await tasks.createTask({ title: 'B' });
    history.boundary();
    await Promise.all([tasks.deleteTask(a.id), tasks.deleteTask(b.id)]);

    expect(await history.undo()).toBe('trash');
    expect((await rawTasks.getTask(a.id)).trashedAt).toBeNull();
    expect((await rawTasks.getTask(b.id)).trashedAt).toBeNull();
  });

  it('撤销完成重复任务：回到未完成，派生的下一次实例被删除', async () => {
    const { raw, history, tasks, rawTasks } = device;
    const task = await tasks.createTask({
      title: '浇花',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2030-01-07',
    });
    await tasks.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    history.boundary();
    await tasks.completeTask(task.id);
    expect(await raw.list('task')).toHaveLength(2);

    expect(await history.undo()).toBe('complete');
    expect((await rawTasks.getTask(task.id)).status).toBe(TaskStatus.ACTIVE);
    expect((await raw.list('task')).map((row) => row.id)).toEqual([task.id]);

    // 撤销后再次完成：照常派生（确定性 id 已被删除请求用掉，改用新 id）。
    history.boundary();
    await tasks.completeTask(task.id);
    expect(await raw.list('task')).toHaveLength(2);
  });

  it('之后被改过的字段不回写', async () => {
    const { history, tasks, rawTasks } = device;
    const task = await tasks.createTask({ title: '旧标题' });
    history.boundary();
    await tasks.updateTask(task.id, { title: '新标题', notes: '备注' });
    // 另一处（不记录撤销的写入，如其他设备同步而来）又改了标题。
    await rawTasks.updateTask(task.id, { title: '别处改的' });

    await history.undo();
    const after = await rawTasks.getTask(task.id);
    expect(after.title).toBe('别处改的');
    expect(after.notes).toBeNull();
  });

  it('删除 Subtask 可撤销：按原字段重建', async () => {
    const { history, tasks, rawTasks } = device;
    const task = await tasks.createTask({ title: '出差' });
    const subtask = await tasks.createSubtask(task.id, { title: '订酒店' });
    history.boundary();
    await tasks.deleteSubtask(subtask.id);

    expect(await history.undo()).toBe('trash');
    const subtasks = (await rawTasks.getTask(task.id)).subtasks;
    expect(subtasks?.map((s) => s.title)).toEqual(['订酒店']);
  });

  it('不可还原的物理删除清空历史', async () => {
    const { history, tasks, areas } = device;
    await tasks.createTask({ title: '保留' });
    const area = await areas.createArea({ title: '工作' });
    history.boundary();
    await areas.deleteArea(area.id);

    expect(await history.peek()).toBeNull();
    expect(await history.undo()).toBeNull();
  });

  it('用户输入划分步骤', async () => {
    const { history, tasks } = device;
    const target = new EventTarget();
    const uninstall = installUndoBoundaries(target as unknown as Window, history);
    const task = await tasks.createTask({ title: 'A' });
    target.dispatchEvent(new Event('pointerdown'));
    await tasks.updateTask(task.id, { title: 'B' });
    uninstall();

    expect(await history.undo()).toBe('edit');
    expect(await history.undo()).toBe('create');
  });

  it('detach 后撤销为空操作', async () => {
    const { history, tasks } = device;
    await tasks.createTask({ title: 'A' });
    history.detach();
    expect(await history.undo()).toBeNull();
  });
});
