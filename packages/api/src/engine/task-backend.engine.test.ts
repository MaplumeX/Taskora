import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySyncHub, deriveRepeatInstanceId, openEngine, type Engine } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import {
  ScheduledType,
  ProjectBucket,
  ProjectStatus,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';

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

  it('拖拽排序：reorder 只写被拖动的一行，且只触发一次变更通知', async () => {
    const a = await backend.createTask({ title: 'A' });
    const b = await backend.createTask({ title: 'B' });
    const c = await backend.createTask({ title: 'C' });
    await engine.sync();
    // 新任务插在最前：当前顺序 C、B、A
    expect((await backend.getFeed('inbox')).map((i) => i.title)).toEqual(['C', 'B', 'A']);
    const positionOf = async (id: string) => (await engine.get('task', id))?.fields.position;
    const [beforeB, beforeC] = [await positionOf(b.id), await positionOf(c.id)];

    let notifications = 0;
    const off = engine.onChange(() => {
      notifications += 1;
    });
    // 把 A 拖到最前
    await backend.reorderTasks([a.id, c.id, b.id]);
    off();
    expect((await backend.getFeed('inbox')).map((i) => i.title)).toEqual(['A', 'C', 'B']);

    // 只有 A 换了 Position；B、C 原样，Outbox 只多一条
    expect(await positionOf(b.id)).toBe(beforeB);
    expect(await positionOf(c.id)).toBe(beforeC);
    expect(await engine.pendingCount()).toBe(1);
    expect(notifications).toBe(1);
  });

  it('feed 拖拽重排：项目行写 Feed Position、不动侧边栏 Position，并同步到 hub', async () => {
    const someday = { status: 'ACTIVE', bucket: 'SOMEDAY', scheduledType: 'SOMEDAY', trashedAt: null };
    const t1 = await engine.create('task', { ...someday, title: 'T1', position: 'a1' });
    const t2 = await engine.create('task', { ...someday, title: 'T2', position: 'a2' });
    const p = await engine.create('project', { ...someday, title: 'P', position: 'a5' });
    await engine.sync();
    const titles = async () => (await backend.getFeed('someday')).map((item) => item.title);
    expect(await titles()).toEqual(['T1', 'T2', 'P']);

    // 把项目行拖到 T1、T2 之间：只有项目行移动
    await backend.reorderFeed([
      { type: 'task', id: t1 },
      { type: 'project', id: p },
      { type: 'task', id: t2 },
    ]);
    expect(await titles()).toEqual(['T1', 'P', 'T2']);
    const row = await engine.get('project', p);
    expect(row?.fields.position).toBe('a5');
    expect(row?.fields.feedPosition).toEqual(expect.any(String));
    expect((await engine.get('task', t1))?.fields.position).toBe('a1');
    expect((await engine.get('task', t2))?.fields.position).toBe('a2');

    // hub 认识 feedPosition：推送不被拒，Outbox 清空
    await engine.sync();
    expect(await engine.pendingCount()).toBe(0);
  });

  it('re-balance 合并任务 Position 与项目 Feed Position：修复膨胀键后混排顺序不变', async () => {
    const long = (base: string) => base + 'V'.repeat(30);
    await engine.create('task', {
      title: 'A',
      status: 'ACTIVE',
      bucket: 'SOMEDAY',
      scheduledType: 'SOMEDAY',
      trashedAt: null,
      position: long('a0'),
    });
    await engine.create('project', {
      title: 'P',
      status: 'ACTIVE',
      bucket: 'SOMEDAY',
      scheduledType: 'SOMEDAY',
      trashedAt: null,
      position: 'a5',
      feedPosition: long('a0') + 'V',
    });
    await engine.create('task', {
      title: 'B',
      status: 'ACTIVE',
      bucket: 'SOMEDAY',
      scheduledType: 'SOMEDAY',
      trashedAt: null,
      position: long('a0') + 'W',
    });
    const titles = async () => (await backend.getFeed('someday')).map((item) => item.title);
    expect(await titles()).toEqual(['A', 'P', 'B']);

    await engine.sync();

    const keys = [
      ...(await engine.list('task')).map((row) => row.fields.position as string),
      ...(await engine.list('project')).map((row) => row.fields.feedPosition as string),
    ];
    expect(keys.every((key) => key.length <= 24)).toBe(true);
    expect(await titles()).toEqual(['A', 'P', 'B']);
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
    await backend.createTask({
      title: '看牙医',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-01-05',
    });

    // 新任务插最前（newest-first），看牙医为 SCHEDULED 不在 inbox
    expect((await backend.getTasks({ view: 'inbox' })).map((t) => t.title)).toEqual([
      '写文档',
      '买咖啡豆',
    ]);
    expect((await backend.getTasks({ tagId })).map((t) => t.title)).toEqual(['买咖啡豆']);
    expect((await backend.getTasks({ q: '咖啡' })).map((t) => t.title)).toEqual(['买咖啡豆']);
    expect((await backend.getTasks()).map((t) => t.title)).toHaveLength(3);
    expect((await backend.getTask(tagged.id)).tags?.map((t) => t.id)).toEqual([tagId]);
  });

  it('feed：today 含任务与项目，项目计数本地计算', async () => {
    await backend.createTask({
      title: '今日任务',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-01-01',
    });
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

describe('EngineTaskBackend（V2：Subtask / convert / emptyTrash 全离线）', () => {
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

  it('Subtask CRUD 与重排全部本地：create/update/complete/取消/删除', async () => {
    const task = await backend.createTask({ title: '父任务' });
    const s1 = await backend.createSubtask(task.id, { title: '步骤一' });
    const s2 = await backend.createSubtask(task.id, { title: '步骤二' });
    expect(s1.position! < s2.position!).toBe(true);

    const detail = await backend.getTask(task.id);
    expect(detail.subtasks?.map((s) => s.title)).toEqual(['步骤一', '步骤二']);

    await backend.updateSubtask(s1.id, { title: '步骤一（改名）' });
    const completed = await backend.completeSubtask(s1.id);
    expect(completed.status).toBe(TaskStatus.COMPLETED);
    expect(completed.completedAt).not.toBeNull();

    await backend.reorderSubtasks(task.id, [s2.id, s1.id]);
    const reordered = await backend.getTask(task.id);
    expect(reordered.subtasks?.map((s) => s.id)).toEqual([s2.id, s1.id]);

    await backend.cancelSubtask(s2.id);
    expect((await backend.getTask(task.id)).subtasks?.find((s) => s.id === s2.id)?.status).toBe(
      TaskStatus.CANCELLED,
    );

    await backend.deleteSubtask(s1.id);
    expect((await backend.getTask(task.id)).subtasks?.map((s) => s.id)).toEqual([s2.id]);
  });

  it('createSubtask：afterId 插入到其后、后续顺延；客户端 id 被采用且重复创建幂等', async () => {
    const task = await backend.createTask({ title: '父任务' });
    const s1 = await backend.createSubtask(task.id, { title: '一' });
    const s3 = await backend.createSubtask(task.id, { title: '三' });
    const id = crypto.randomUUID();
    const s2 = await backend.createSubtask(task.id, { title: '二', id, afterId: s1.id });
    expect(s2.id).toBe(id);
    // 以刚建的 id 为锚点连续插入
    await backend.createSubtask(task.id, { title: '二点五', afterId: id });

    const titles = async () => (await backend.getTask(task.id)).subtasks?.map((s) => s.title);
    expect(await titles()).toEqual(['一', '二', '二点五', '三']);
    const s3Row = (await backend.getTask(task.id)).subtasks?.find((s) => s.id === s3.id);
    // Position 只给新行分配，「三」不动
    expect(s3Row?.position).toBe(s3.position);

    await backend.createSubtask(task.id, { title: '二', id, afterId: s1.id });
    expect(await titles()).toEqual(['一', '二', '二点五', '三']);

    // 找不到的 afterId 退化为追加
    await backend.createSubtask(task.id, { title: '尾', afterId: 'missing' });
    expect((await titles())?.at(-1)).toBe('尾');
  });

  it('convert：断网也能转 Project，新 Project 继承字段、Subtask 提升为 Task、原 Task 干净消失', async () => {
    const tagId = await engine.create('tag', { title: '装修', color: '#3B82F6', tagGroupId: null });
    const areaId = await engine.create('area', { title: '家', notes: null, tagIds: [] });
    const task = await backend.createTask({
      title: '重新装修',
      notes: '含木工',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-06-01',
      dueDate: '2026-07-01',
      areaId,
      tagIds: [tagId],
    });
    await backend.createSubtask(task.id, { title: '找师傅' });
    const done = await backend.createSubtask(task.id, { title: '定方案' });
    await backend.completeSubtask(done.id);

    const project = await backend.convertTaskToProject(task.id);

    // 继承：标题/备注/日期/归属/标签/终态映射
    expect(project.title).toBe('重新装修');
    expect(project.notes).toBe('含木工');
    expect(project.scheduledDate).toBe('2026-06-01');
    expect(project.dueDate).toBe('2026-07-01');
    expect(project.areaId).toBe(areaId);
    expect(project.status).toBe(ProjectStatus.ACTIVE);
    expect(project.tags?.map((t) => t.id)).toEqual([tagId]);

    // 原 Task 干净消失（不在 Trash 留尸体）
    expect((await backend.getFeed('trash')).map((i) => i.title)).not.toContain('重新装修');
    await expect(backend.getTask(task.id)).rejects.toThrow();

    // Subtask 提升为完整 Task：继承标题/状态/了结时间，有归属落位 ANYTIME
    const promotedRows = (await engine.list('task')).filter(
      (row) => row.fields.projectId === project.id,
    );
    expect(promotedRows.map((r) => r.fields.title).sort()).toEqual(['定方案', '找师傅']);
    const settledRow = promotedRows.find((r) => r.fields.title === '定方案');
    expect(settledRow?.fields.status).toBe(TaskStatus.COMPLETED);
    expect(settledRow?.fields.settledAt).not.toBeNull();
    expect(promotedRows.every((r) => r.fields.bucket === TaskBucket.ANYTIME)).toBe(true);
    // 原 Subtask 行不残留
    expect(await engine.get('subtask', done.id)).toBeNull();

    // 终态映射：已完成 Task 转出 COMPLETED Project（仅 COMPLETED 映射）
    const doneTask = await backend.createTask({ title: '已完结任务' });
    await backend.completeTask(doneTask.id);
    const doneProject = await backend.convertTaskToProject(doneTask.id);
    expect(doneProject.status).toBe(ProjectStatus.COMPLETED);
    expect(doneProject.completedAt).not.toBeNull();
  });

  it('convert 收敛：A 转换后 B 同步看到同一结果（字段写 + 删除组合）', async () => {
    const hub = new InMemorySyncHub();
    const a = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-a',
      transport: hub.transportFor(USER),
    });
    const b = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-b',
      transport: hub.transportFor(USER),
    });
    const backendA = createEngineTaskBackend({ engine: a });

    const task = await backendA.createTask({ title: '升级房子' });
    await backendA.createSubtask(task.id, { title: '铺地板' });
    await backendA.createSubtask(task.id, { title: '刷墙' });
    await a.sync();
    await b.sync();

    await backendA.convertTaskToProject(task.id);
    await a.sync();
    await b.sync();

    // B 看到：原 Task 消失，新 Project 存在，提升的 Task 属于新 Project
    const projectRows = await b.list('project');
    expect(projectRows.map((r) => r.fields.title)).toEqual(['升级房子']);
    const tasks = await b.list('task');
    expect(tasks.map((r) => r.fields.projectId)).toEqual([projectRows[0].id, projectRows[0].id]);
    expect(await b.get('task', task.id)).toBeNull();
    expect(await b.list('subtask')).toHaveLength(0);
    await a.close();
    await b.close();
  });

  it('emptyTrash：物理删除跨设备生效（含 trashed Project 下属 Task 与级联 Subtask）', async () => {
    const hub = new InMemorySyncHub();
    const a = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-a',
      transport: hub.transportFor(USER),
    });
    const b = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-b',
      transport: hub.transportFor(USER),
    });
    const backendA = createEngineTaskBackend({ engine: a });

    const keep = await backendA.createTask({ title: '留下的' });
    const trashed = await backendA.createTask({ title: '要删的' });
    await backendA.deleteTask(trashed.id);
    const projectId = await a.create('project', {
      title: '废弃项目',
      status: 'ACTIVE',
      bucket: ProjectBucket.ANYTIME,
      scheduledType: 'NONE',
    });
    const taskInProject = await a.create('task', {
      title: '项目内任务',
      status: 'ACTIVE',
      bucket: 'ANYTIME',
      projectId,
      trashedAt: null,
      settledAt: null,
    });
    await a.create('subtask', { title: '级联子步骤', taskId: taskInProject, status: 'ACTIVE' });
    await a.update('project', projectId, { trashedAt: new Date().toISOString() });
    await a.sync();
    await b.sync();

    const result = await backendA.emptyTrash();
    expect(result.deletedTasks).toBe(2); // 要删的 + 项目内任务
    expect(result.deletedProjects).toBe(1);
    expect(await a.get('task', trashed.id)).toBeNull();
    expect(await a.get('project', projectId)).toBeNull();
    expect(await a.list('subtask')).toHaveLength(0);

    await a.sync();
    await b.sync();
    // 跨设备生效
    expect(await b.get('task', trashed.id)).toBeNull();
    expect(await b.get('project', projectId)).toBeNull();
    expect(await b.list('subtask')).toHaveLength(0);
    expect((await b.get('task', keep.id))?.fields.title).toBe('留下的');
    await a.close();
    await b.close();
  });
});

describe('EngineTaskBackend — Reminder 清理规则（reminders spec）', () => {
  let engine: Engine;
  let backend: ReturnType<typeof createEngineTaskBackend>;

  beforeEach(async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    const hub = new InMemorySyncHub();
    engine = await openEngine({
      storage,
      deviceId: 'dev-reminder',
      transport: hub.transportFor(USER),
    });
    backend = createEngineTaskBackend({ engine });
    setTaskBackend(backend);
  });

  it('DATE 任务可设置/修改/关闭提醒；换日期保留提醒时刻', async () => {
    const task = await backend.createTask({
      title: '看牙医',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-01',
    });
    expect(task.reminderTime).toBeNull();

    const withReminder = await backend.updateTask(task.id, { reminderTime: '09:00' });
    expect(withReminder.reminderTime).toBe('09:00');

    const changed = await backend.updateTask(task.id, { reminderTime: '18:30' });
    expect(changed.reminderTime).toBe('18:30');

    // DATE → DATE：只换日期，提醒时刻保留
    const moved = await backend.updateTask(task.id, {
      scheduledDate: '2026-03-05',
    });
    expect(moved.reminderTime).toBe('18:30');

    const off = await backend.updateTask(task.id, { reminderTime: null });
    expect(off.reminderTime).toBeNull();
  });

  it('ScheduledType 离开 DATE（Someday / NONE）自动清除提醒', async () => {
    const task = await backend.createTask({
      title: '整理书架',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-01',
    });
    await backend.updateTask(task.id, { reminderTime: '09:00' });

    const someday = await backend.updateTask(task.id, {
      scheduledType: ScheduledType.SOMEDAY,
    });
    expect(someday.reminderTime).toBeNull();

    // 重新设回 DATE + 提醒，再走 NONE
    await backend.updateTask(task.id, {
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-02',
    });
    await backend.updateTask(task.id, { reminderTime: '08:00' });
    const cleared = await backend.updateTask(task.id, {
      scheduledType: ScheduledType.NONE,
      scheduledDate: null,
    });
    expect(cleared.reminderTime).toBeNull();
  });

  it('了结（完成/取消）与移入 Trash 清除提醒', async () => {
    const task = await backend.createTask({
      title: '缴水电费',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-01',
    });
    await backend.updateTask(task.id, { reminderTime: '09:00' });

    expect((await backend.completeTask(task.id)).reminderTime).toBeNull();

    // 恢复为 ACTIVE 后提醒不会复活（数据已清除）
    await backend.uncompleteTask(task.id);
    const revived = await backend.getTask(task.id);
    expect(revived.reminderTime).toBeNull();

    await backend.updateTask(task.id, { reminderTime: '10:00' });
    expect((await backend.cancelTask(task.id)).reminderTime).toBeNull();

    await backend.uncancelTask(task.id);
    await backend.updateTask(task.id, { reminderTime: '10:00' });
    await backend.deleteTask(task.id);
    expect((await backend.getTask(task.id)).reminderTime).toBeNull();
  });

  it('reminderTime 走字段级 LWW：跨设备经 hub 收敛', async () => {
    const hub = new InMemorySyncHub();
    const a = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-a',
      transport: hub.transportFor(USER),
    });
    const b = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-b',
      transport: hub.transportFor(USER),
    });
    const backendA = createEngineTaskBackend({ engine: a });
    const task = await backendA.createTask({
      title: '跨设备提醒',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-01',
    });
    await a.update('task', task.id, { reminderTime: '09:00' });
    await a.sync();
    await b.sync();
    expect((await b.get('task', task.id))?.fields.reminderTime).toBe('09:00');

    // B 端晚写胜出
    await new Promise((resolve) => setTimeout(resolve, 5));
    await b.update('task', task.id, { reminderTime: '20:00' });
    await b.sync();
    await a.sync();
    expect((await a.get('task', task.id))?.fields.reminderTime).toBe('20:00');
    await a.close();
    await b.close();
  });
});

describe('EngineTaskBackend — Repeating Tasks（recurring-tasks spec）', () => {
  let engine: Engine;
  let backend: ReturnType<typeof createEngineTaskBackend>;

  /** 相对当前 UTC 日的日期键（±N 天）。 */
  const utcDay = (offset: number): string =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  beforeEach(async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    const hub = new InMemorySyncHub();
    engine = await openEngine({
      storage,
      deviceId: 'dev-repeat',
      transport: hub.transportFor(USER),
    });
    backend = createEngineTaskBackend({ engine });
    setTaskBackend(backend);
  });

  it('DATE 任务可设置/修改/清除规则；写入归一化为规范形；换日期保留规则', async () => {
    const task = await backend.createTask({
      title: '浇花',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-01',
    });
    expect(task.repeatRule).toBeNull();

    // 冗余 weekdays（day 单位）被归一化剥离
    const withRule = await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled', weekdays: [1, 2] },
    });
    expect(withRule.repeatRule).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });

    // DATE → DATE：只换日期，规则保留
    const moved = await backend.updateTask(task.id, { scheduledDate: '2026-03-05' });
    expect(moved.repeatRule).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });

    // 非法规则对象被忽略（不写垃圾、不清除既有规则）
    const bogus = await backend.updateTask(task.id, {
      repeatRule: { unit: 'hour', interval: 1, anchor: 'scheduled' } as never,
    });
    expect(bogus.repeatRule).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });

    const off = await backend.updateTask(task.id, { repeatRule: null });
    expect(off.repeatRule).toBeNull();
  });

  it('ScheduledType 离开 DATE（Someday / NONE）自动清除规则（规则无锚即无意义）', async () => {
    const task = await backend.createTask({
      title: '月度备份',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-01',
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'month', interval: 1, anchor: 'completion' },
    });

    const someday = await backend.updateTask(task.id, { scheduledType: ScheduledType.SOMEDAY });
    expect(someday.repeatRule).toBeNull();

    await backend.updateTask(task.id, {
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-02-02',
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    const cleared = await backend.updateTask(task.id, {
      scheduledType: ScheduledType.NONE,
      scheduledDate: null,
    });
    expect(cleared.repeatRule).toBeNull();
  });

  it('完成 → 立刻派生下一实例：复制集完整、子任务重置、逾期落 Today；父任务保留规则', async () => {
    const tagId = await engine.create('tag', { title: '家务', color: '#3B82F6', tagGroupId: null });
    const task = await backend.createTask({
      title: '浇花',
      notes: '客厅绿植',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-2),
      tagIds: [tagId],
    });
    await backend.updateTask(task.id, {
      reminderTime: '09:00',
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    const sub1 = await backend.createSubtask(task.id, { title: '客厅' });
    await backend.createSubtask(task.id, { title: '阳台' });
    await backend.completeSubtask(sub1.id);

    const expectedId = deriveRepeatInstanceId(
      task.id,
      { unit: 'day', interval: 1, anchor: 'scheduled' },
      utcDay(-1),
    );

    await backend.completeTask(task.id);

    // 派生实例存在且 id 确定
    const instanceRow = await engine.get('task', expectedId);
    expect(instanceRow).not.toBeNull();
    const instance = await backend.getTask(expectedId);
    expect(instance.title).toBe('浇花');
    expect(instance.notes).toBe('客厅绿植');
    expect(instance.scheduledDate).toBe(utcDay(-1));
    expect(instance.scheduledType).toBe(ScheduledType.DATE);
    expect(instance.bucket).toBe(TaskBucket.SCHEDULED);
    expect(instance.status).toBe(TaskStatus.ACTIVE);
    expect(instance.reminderTime).toBe('09:00'); // 提醒随实例延续
    expect(instance.repeatRule).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });
    expect(instance.repeatSourceId).toBe(task.id); // 派生来源（recurring-tasks-v2）
    expect(instance.tags?.map((t) => t.id)).toEqual([tagId]);
    // 子任务复制为派生实体并重置 ACTIVE
    expect(instance.subtasks).toHaveLength(2);
    expect(instance.subtasks?.every((s) => s.status === TaskStatus.ACTIVE)).toBe(true);
    expect(instance.subtasks?.map((s) => s.title).sort()).toEqual(['客厅', '阳台']);

    // 逾期实例（昨天）落 Today；父任务留在 Logbook 且保留规则作溯源
    expect((await backend.getFeed('today')).map((i) => i.id)).toContain(expectedId);
    const parent = await backend.getTask(task.id);
    expect(parent.status).toBe(TaskStatus.COMPLETED);
    expect(parent.reminderTime).toBeNull(); // 了结清除提醒（父任务）
    expect(parent.repeatRule).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });
  });

  it('未来实例落 Upcoming；anchor=completion 从完成日期推算', async () => {
    // anchor=scheduled：明天的任务完成后天出现 → Upcoming
    const fixed = await backend.createTask({
      title: '例会',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(1),
    });
    await backend.updateTask(fixed.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    await backend.completeTask(fixed.id);
    const fixedInstance = (await backend.getTasks({ view: 'upcoming' })).find(
      (t) => t.title === '例会',
    );
    expect(fixedInstance?.scheduledDate).toBe(utcDay(2));

    // anchor=completion：30 天前的任务，今天完成 → 明天出现
    const gap = await backend.createTask({
      title: '换床单',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-30),
    });
    await backend.updateTask(gap.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'completion' },
    });
    await backend.completeTask(gap.id);
    const gapInstance = (await backend.getTasks({ view: 'upcoming' })).find(
      (t) => t.title === '换床单',
    );
    expect(gapInstance?.scheduledDate).toBe(utcDay(1));
  });

  it('到达 until 日期链自动终结：完成后不派生实例', async () => {
    const task = await backend.createTask({
      title: '短期项目同步',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-5),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled', until: utcDay(-4) },
    });
    await backend.completeTask(task.id);
    // until 含当天：下一次出现 == until（utcDay(-4)）→ 仍派生（最后一次）
    expect((await engine.list('task')).filter((t) => t.id !== task.id)).toHaveLength(1);

    // until 早于下一次出现 → 链终结，不派生
    const last = await backend.createTask({
      title: '已到期的承诺',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-5),
    });
    await backend.updateTask(last.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled', until: utcDay(-5) },
    });
    await backend.completeTask(last.id);
    expect(
      (await engine.list('task')).filter((t) => t.id !== task.id && t.id !== last.id),
    ).toHaveLength(1);
  });

  it('取消不派生实例；取消后重开（uncancel）无副作用', async () => {
    const task = await backend.createTask({
      title: '戒掉的习惯',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-1),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    const cancelled = await backend.cancelTask(task.id);
    expect(cancelled.status).toBe(TaskStatus.CANCELLED);
    expect((await engine.list('task')).filter((t) => t.id !== task.id)).toHaveLength(0);

    // 重开：规则完整保留（Cancel 不清规则，与 Completed 同为 Logbook 溯源）
    const revived = await backend.uncancelTask(task.id);
    expect(revived.repeatRule).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });
    expect((await engine.list('task')).filter((t) => t.id !== task.id)).toHaveLength(0);
  });

  it('重开不删除派生实例：实例上的编辑保留，再完成不重复派生（recurring-tasks-v2）', async () => {
    const task = await backend.createTask({
      title: '浇花',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-2),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    await backend.createSubtask(task.id, { title: '客厅' });
    await backend.completeTask(task.id);
    const instanceId = deriveRepeatInstanceId(
      task.id,
      { unit: 'day', interval: 1, anchor: 'scheduled' },
      utcDay(-1),
    );
    await backend.updateTask(instanceId, { notes: '记得换大盆' });

    const reopened = await backend.uncompleteTask(task.id);
    expect(reopened.status).toBe(TaskStatus.ACTIVE);
    const kept = await backend.getTask(instanceId);
    expect(kept.notes).toBe('记得换大盆');
    expect(kept.subtasks).toHaveLength(1);

    await backend.completeTask(task.id);
    expect((await engine.list('task')).filter((row) => row.id !== task.id)).toHaveLength(1);
  });

  it('anchor=completion：重开后隔天再完成不产生第二个实例', async () => {
    const task = await backend.createTask({
      title: '换床单',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-3),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'week', interval: 1, anchor: 'completion' },
    });
    await backend.completeTask(task.id);
    await backend.uncompleteTask(task.id);
    // 隔天完成：完成日不同 → 确定性 id 不同，靠 repeatSourceId 判定已派生
    await backend.completeTask(task.id, {
      settledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect((await engine.list('task')).filter((row) => row.id !== task.id)).toHaveLength(1);
  });

  it('完成 → 取消 → 重开：派生实例保留', async () => {
    const task = await backend.createTask({
      title: '晨跑',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-1),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'completion' },
    });
    await backend.completeTask(task.id);
    await backend.cancelTask(task.id);
    await backend.uncancelTask(task.id);
    const instances = (await engine.list('task')).filter((row) => row.id !== task.id);
    expect(instances).toHaveLength(1);
    expect(instances[0].fields.repeatSourceId).toBe(task.id);
  });

  it('幂等派生：Logbook 恢复（Trash restore）后重新完成不产生重复实例', async () => {
    const task = await backend.createTask({
      title: '每周汇报',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-1),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    await backend.completeTask(task.id);
    const instanceId = deriveRepeatInstanceId(
      task.id,
      { unit: 'week', interval: 1, anchor: 'scheduled' },
      utcDay(6),
    );
    expect(await engine.get('task', instanceId)).not.toBeNull();

    // 从 Trash 捡回（不删派生实例）→ 重新完成：目标 id 已存在 → 幂等跳过
    await backend.deleteTask(task.id);
    await backend.restoreTask(task.id);
    await backend.completeTask(task.id);

    const tasks = await engine.list('task');
    expect(tasks).toHaveLength(2); // 父任务 + 唯一实例，无重复
    expect(await engine.get('task', instanceId)).not.toBeNull();
  });

  it('两台离线设备并发完成同一重复任务 → 同步后恰好一个实例（ADR-0012）', async () => {
    const hub = new InMemorySyncHub();
    const a = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-a',
      transport: hub.transportFor(USER),
    });
    const b = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-b',
      transport: hub.transportFor(USER),
    });
    const backendA = createEngineTaskBackend({ engine: a });
    const backendB = createEngineTaskBackend({ engine: b });

    const task = await backendA.createTask({
      title: '跨设备重复',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-1),
    });
    await backendA.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    await backendA.createSubtask(task.id, { title: '子任务一' });
    await backendA.createSubtask(task.id, { title: '子任务二' });
    await a.sync();
    await b.sync(); // B 拉到任务与规则后离线

    // 两台设备各自离线完成 → 各自本地派生（确定性 id 相同）
    await backendA.completeTask(task.id);
    await backendB.completeTask(task.id);

    await a.sync();
    await b.sync();
    await a.sync(); // 双向收敛

    const rowsA = await a.list('task');
    const rowsB = await b.list('task');
    expect(rowsA).toHaveLength(2); // 父任务 + 恰好一个实例
    expect(rowsB).toHaveLength(2);
    const instanceA = rowsA.find((row) => row.id !== task.id)!;
    const instanceB = rowsB.find((row) => row.id !== task.id)!;
    expect(instanceA.id).toBe(instanceB.id); // 同一逻辑实例
    expect(instanceA.fields.title).toBe('跨设备重复');
    // 实例作为普通 Task 走 LWW：字段一致
    expect(instanceB.fields.title).toBe('跨设备重复');
    expect(instanceA.fields.scheduledDate).toBe(instanceB.fields.scheduledDate);
    // 子任务集合同样收敛（ADR-0012：子任务 id 也确定性派生）
    const subtasksA = (await a.list('subtask')).filter((s) => s.fields.taskId === instanceA.id);
    const subtasksB = (await b.list('subtask')).filter((s) => s.fields.taskId === instanceB.id);
    expect(subtasksA.map((s) => s.id).sort()).toEqual(subtasksB.map((s) => s.id).sort());
    expect(subtasksA).toHaveLength(2);
    await a.close();
    await b.close();
  });

  it('跳过本次：逾期多轮落到今天、截止日平移、Subtask 重置；不新建实体', async () => {
    const task = await backend.createTask({
      title: '背单词',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-3),
      dueDate: utcDay(-1),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    const sub = await backend.createSubtask(task.id, { title: '复习' });
    await backend.completeSubtask(sub.id);

    const skipped = await backend.skipTask(task.id);
    expect(skipped.scheduledDate).toBe(utcDay(0));
    expect(skipped.dueDate).toBe(utcDay(2));
    expect(skipped.status).toBe(TaskStatus.ACTIVE);
    expect((await backend.getTask(task.id)).subtasks?.map((s) => s.status)).toEqual([
      TaskStatus.ACTIVE,
    ]);
    expect(await engine.list('task')).toHaveLength(1);

    // 计划日为今天 → 严格下一次
    expect((await backend.skipTask(task.id)).scheduledDate).toBe(utcDay(1));
  });

  it('跳过本次不可用：已到最后一次 / 下一次已存在 / 已了结', async () => {
    const last = await backend.createTask({
      title: '最后一次',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(1),
    });
    await backend.updateTask(last.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled', until: utcDay(1) },
    });
    await expect(backend.skipTask(last.id)).rejects.toMatchObject({ reason: 'no-next' });

    const task = await backend.createTask({
      title: '手滑',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-1),
    });
    await backend.updateTask(task.id, {
      repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    });
    await backend.completeTask(task.id);
    await expect(backend.skipTask(task.id)).rejects.toMatchObject({ reason: 'not-active' });
    await backend.uncompleteTask(task.id); // 派生实例保留
    await expect(backend.skipTask(task.id)).rejects.toMatchObject({ reason: 'next-exists' });
    expect((await backend.getTask(task.id)).scheduledDate).toBe(utcDay(-1));
  });

  it('跳过与另一设备的完成并发：合并后只有一个存活的下一次', async () => {
    const hub = new InMemorySyncHub();
    const a = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-a',
      transport: hub.transportFor(USER),
    });
    const b = await openEngine({
      storage: await createNodeSqliteStorage(':memory:'),
      deviceId: 'dev-b',
      transport: hub.transportFor(USER),
    });
    const backendA = createEngineTaskBackend({ engine: a });
    const backendB = createEngineTaskBackend({ engine: b });
    const task = await backendA.createTask({
      title: '周报',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-1),
    });
    await backendA.updateTask(task.id, {
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    await a.sync();
    await b.sync();

    await backendA.skipTask(task.id);
    await backendB.completeTask(task.id);
    await a.sync();
    await b.sync();
    await a.sync();

    for (const engineX of [a, b]) {
      const active = (await engineX.list('task')).filter(
        (row) => row.fields.status === TaskStatus.ACTIVE && !row.fields.trashedAt,
      );
      expect(active).toHaveLength(1);
      expect(active[0].fields.scheduledDate).toBe(utcDay(6));
    }
    await a.close();
    await b.close();
  });

  it('派生实例在 Trash 中：重开再完成换新 id 重新派生，同步后存活', async () => {
    const rule = { unit: 'day', interval: 1, anchor: 'scheduled' } as const;
    const task = await backend.createTask({
      title: '手滑党',
      scheduledType: ScheduledType.DATE,
      scheduledDate: utcDay(-2),
    });
    await backend.updateTask(task.id, { repeatRule: rule });
    await backend.completeTask(task.id);
    const plannedId = deriveRepeatInstanceId(task.id, rule, utcDay(-1));
    await backend.deleteTask(plannedId); // 用户丢弃了派生实例
    await backend.uncompleteTask(task.id);
    await backend.completeTask(task.id);

    const live = (await engine.list('task')).filter(
      (row) => row.id !== task.id && !row.fields.trashedAt,
    );
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(plannedId);
    expect(live[0].fields.repeatSourceId).toBe(task.id);

    await engine.sync();
    expect(await engine.get('task', live[0].id)).not.toBeNull();
  });
});
