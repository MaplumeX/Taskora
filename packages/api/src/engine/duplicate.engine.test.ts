/**
 * 复制（Duplicate）在设备 Engine 后端上的行为：任务副本紧跟来源、连同
 * Subtask / 附件；项目副本整份复制、紧跟来源项目；副本全部为未完成。
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySyncHub, openEngine, sortByEffectivePosition } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { ProjectStatus, ScheduledType, TaskStatus } from '@taskora/shared';

import { createEngineProjectBackend } from './project-backend.engine';
import { createEngineProjectHeadingBackend } from './project-heading-backend.engine';
import { createEngineTaskBackend } from './task-backend.engine';

const USER = 'user-1';

async function open() {
  const hub = new InMemorySyncHub();
  const engine = await openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId: 'dev-test',
    transport: hub.transportFor(USER),
  });
  return {
    engine,
    projects: createEngineProjectBackend({ engine }),
    headings: createEngineProjectHeadingBackend({ engine }),
    tasks: createEngineTaskBackend({ engine }),
  };
}

describe('复制（Engine 后端）', () => {
  let device: Awaited<ReturnType<typeof open>>;

  beforeEach(async () => {
    device = await open();
  });

  it('任务：副本紧跟来源，内容照抄，Subtask 与附件一并复制且未完成', async () => {
    const { engine, tasks } = device;
    const first = await tasks.createTask({
      title: '订机票',
      notes: '靠窗',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2030-01-07',
      dueDate: '2030-01-09',
    });
    const second = await tasks.createTask({ title: '订酒店' });
    const subtask = await tasks.createSubtask(first.id, { title: '比价' });
    await tasks.completeSubtask(subtask.id);
    await tasks.createAttachment(first.id, {
      name: 'itinerary.pdf',
      mimeType: 'application/pdf',
      size: 10,
      blobHash: 'hash-1',
    });

    const copy = await tasks.duplicateTask(first.id);

    expect(copy.id).not.toBe(first.id);
    expect(copy).toMatchObject({
      title: '订机票',
      notes: '靠窗',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2030-01-07',
      dueDate: '2030-01-09',
      status: TaskStatus.ACTIVE,
      repeatSourceId: null,
    });
    const order = sortByEffectivePosition(
      (await engine.list('task')).map((row) => ({
        id: row.id,
        position: row.fields.position as string,
      })),
    ).map((row) => row.id);
    expect(order).toEqual([first.id, copy.id, second.id]);

    const full = await tasks.getTask(copy.id);
    expect(full.subtasks?.map((s) => [s.title, s.status])).toEqual([['比价', TaskStatus.ACTIVE]]);
    expect(full.attachments?.map((a) => [a.name, a.blobHash])).toEqual([
      ['itinerary.pdf', 'hash-1'],
    ]);
    // 来源不受影响
    expect((await tasks.getTask(first.id)).subtasks?.[0].status).toBe(TaskStatus.COMPLETED);
  });

  it('已完成的任务：副本为未完成', async () => {
    const { tasks } = device;
    const task = await tasks.createTask({ title: '交报告' });
    await tasks.completeTask(task.id);
    const copy = await tasks.duplicateTask(task.id);
    expect(copy.status).toBe(TaskStatus.ACTIVE);
    expect(copy.completedAt).toBeNull();
  });

  it('项目：整份复制 Headings / 任务，紧跟来源项目，全部未完成', async () => {
    const { engine, projects, headings, tasks } = device;
    const project = await projects.createProject({ title: '搬家' });
    const after = await projects.createProject({ title: '其他' });
    const heading = await headings.createProjectHeading({ projectId: project.id, title: '打包' });
    const done = await tasks.createTask({ title: '买纸箱', projectId: project.id });
    await engine.update('task', done.id, { headingId: heading.id });
    await tasks.completeTask(done.id);
    const trashed = await tasks.createTask({ title: '旧计划', projectId: project.id });
    await tasks.deleteTask(trashed.id);

    const copy = await projects.duplicateProject(project.id);

    expect(copy).toMatchObject({
      title: '搬家',
      status: ProjectStatus.ACTIVE,
      repeatSourceId: null,
    });
    expect((await projects.getProjects()).map((p) => p.id)).toEqual([
      project.id,
      copy.id,
      after.id,
    ]);
    const copiedHeadings = await engine.list('project-heading', { where: { projectId: copy.id } });
    expect(copiedHeadings.map((row) => row.fields.title)).toEqual(['打包']);
    const copiedTasks = await tasks.getTasks({ projectId: copy.id });
    expect(copiedTasks.map((t) => [t.title, t.status, t.headingId])).toEqual([
      ['买纸箱', TaskStatus.ACTIVE, copiedHeadings[0].id],
    ]);
  });
});
