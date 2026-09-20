import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySyncHub, openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';

import { createEngineTaskBackend } from './task-backend.engine';
import { setTaskBackend } from '../api/task-backend';

const USER = 'user-1';

describe('EngineTaskBackend（切片一：Inbox/Today Task CRUD 走 Engine）', () => {
  let engine: Engine;
  let backend: ReturnType<typeof createEngineTaskBackend>;

  beforeEach(async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    const hub = new InMemorySyncHub();
    engine = await openEngine({
      storage,
      deviceId: 'dev-test',
      transport: hub.transportFor(USER),
    });
    backend = createEngineTaskBackend({ engine });
    setTaskBackend(backend);
  });

  it('createTask：默认进 Inbox（无归属），带日期则落 SCHEDULED，新任务排最前', async () => {
    const first = await backend.createTask({ title: '第一条' });
    await backend.createTask({ title: '第二条' });
    expect(first.bucket).toBe(TaskBucket.INBOX);
    expect(first.status).toBe(TaskStatus.ACTIVE);
    expect(first.completedAt).toBeNull();

    const scheduled = await backend.createTask({
      title: '日程',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-01-02',
    });
    expect(scheduled.bucket).toBe(TaskBucket.SCHEDULED);

    // 新任务排最前（与 REST 时代 newest-first 观感一致）
    const inbox = await backend.getFeed('inbox');
    expect(inbox.map((item) => item.title)).toEqual(['第二条', '第一条']);
  });

  it('完成 → Today 视图消失；取消与恢复语义（Settled At，ADR 0006）', async () => {
    const task = await backend.createTask({
      title: '今天的任务',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-01-01',
    });
    expect((await backend.getFeed('today')).map((i) => i.title)).toEqual(['今天的任务']);

    const completed = await backend.completeTask(task.id);
    expect(completed.status).toBe(TaskStatus.COMPLETED);
    expect(completed.completedAt).not.toBeNull();
    expect(await backend.getFeed('today')).toHaveLength(0);

    // 恢复到未了结（uncancel/uncomplete 同语义）
    const restored = await backend.uncompleteTask(task.id);
    expect(restored.status).toBe(TaskStatus.ACTIVE);
    expect(restored.completedAt).toBeNull();

    const cancelled = await backend.cancelTask(task.id);
    expect(cancelled.status).toBe(TaskStatus.CANCELLED);
    expect(cancelled.completedAt).not.toBeNull();
  });

  it('updateTask：scheduledType/归属变化触发 bucket 解析（对齐 REST 语义）', async () => {
    const task = await backend.createTask({ title: '整理' });
    // 加日期 → SCHEDULED
    await backend.updateTask(task.id, {
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-03-01',
    });
    expect((await backend.getTask(task.id)).bucket).toBe(TaskBucket.SCHEDULED);
    // 去掉日期、无归属 → 回 INBOX
    await backend.updateTask(task.id, { scheduledType: ScheduledType.NONE });
    const after = await backend.getTask(task.id);
    expect(after.bucket).toBe(TaskBucket.INBOX);
    expect(after.scheduledDate).toBeNull();
  });

  it('Trash / 恢复：软删除是普通字段变更，恢复一律回 ACTIVE', async () => {
    const task = await backend.createTask({ title: '要删的' });
    await backend.deleteTask(task.id);
    expect(await backend.getFeed('inbox')).toHaveLength(0);

    const trash = await backend.getFeed('trash');
    expect(trash.map((i) => i.title)).toEqual(['要删的']);

    const restored = await backend.restoreTask(task.id);
    expect(restored.status).toBe(TaskStatus.ACTIVE);
    expect(restored.trashedAt).toBeNull();
    expect((await backend.getFeed('inbox')).map((i) => i.title)).toEqual(['要删的']);
  });

  it('拖拽排序：reorder 后 Position 生效且不产生多余 Outbox 条目', async () => {
    const a = await backend.createTask({ title: 'A' });
    const b = await backend.createTask({ title: 'B' });
    const c = await backend.createTask({ title: 'C' });
    const pendingBefore = await engine.pendingCount();

    await backend.reorderTasks([c.id, a.id, b.id]);
    expect((await backend.getFeed('inbox')).map((i) => i.title)).toEqual(['C', 'A', 'B']);

    // 只给顺序变化的行追加 Outbox（A、B 换位，C 已在最前不动）
    const pendingAfter = await engine.pendingCount();
    expect(pendingAfter - pendingBefore).toBeLessThanOrEqual(2);
  });

  it('本地写与 hub 收敛：flush/pull 后两端一致，REST 回声幂等', async () => {
    await backend.createTask({ title: '同步验证' });
    expect(await engine.pendingCount()).toBe(1);
    await engine.sync();
    expect(await engine.pendingCount()).toBe(0);
    await engine.sync(); // 回声幂等
    const inbox = await backend.getFeed('inbox');
    expect(inbox.map((i) => i.title)).toEqual(['同步验证']);
  });

  it('getTasks：视图/搜索/标签过滤与 REST 语义对齐', async () => {
    const tagId = await engine.create('tag', { title: '购物', color: '#3B82F6', tagGroupId: null });
    const tagged = await backend.createTask({ title: '买咖啡豆', tagIds: [tagId] });
    await backend.createTask({ title: '写文档' });
    await backend.createTask({ title: '看牙医', scheduledType: ScheduledType.DATE, scheduledDate: '2026-01-05' });

    // 新任务插最前（newest-first），看牙医为 SCHEDULED 不在 inbox
    expect((await backend.getTasks({ view: 'inbox' })).map((t) => t.title)).toEqual(['写文档', '买咖啡豆']);
    expect((await backend.getTasks({ tagId })).map((t) => t.title)).toEqual(['买咖啡豆']);
    expect((await backend.getTasks({ q: '咖啡' })).map((t) => t.title)).toEqual(['买咖啡豆']);
    expect((await backend.getTasks()).map((t) => t.title)).toHaveLength(3);
    expect((await backend.getTask(tagged.id)).tags?.map((t) => t.id)).toEqual([tagId]);
  });

  it('feed：today 含任务与项目，项目计数本地计算', async () => {
    await backend.createTask({ title: '今日任务', scheduledType: ScheduledType.DATE, scheduledDate: '2026-01-01' });
    const hubTask = await engine.create('project', {
      title: '装修',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      scheduledType: 'DATE',
      scheduledDate: '2026-01-01',
      trashedAt: null,
      completedAt: null,
      areaId: null,
      tagIds: [],
    });
    await engine.create('task', {
      title: '量尺寸',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      projectId: hubTask,
      trashedAt: null,
      settledAt: null,
      tagIds: [],
    });

    const today = await backend.getFeed('today');
    const titles = today.map((item) => item.title);
    expect(titles).toContain('今日任务');
    expect(titles).toContain('装修');
    const project = today.find((item) => item.type === 'project');
    expect(project).toMatchObject({ taskTotalCount: 1, taskCompletedCount: 0 });
  });
});
