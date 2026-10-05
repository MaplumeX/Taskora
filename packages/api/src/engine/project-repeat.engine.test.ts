/**
 * 重复项目（recurring-projects spec）在设备 Engine 后端上的行为：完成时
 * 了结剩余任务并派生下一轮（Headings / 任务 / Subtask 副本）、幂等、跳过
 * 本次，以及两台离线设备并发完成后收敛为一个下一轮。
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { InMemorySyncHub, openEngine, RepeatSkipBlockedError } from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { HeadingStatus, ProjectStatus, ScheduledType, TaskStatus } from '@taskora/shared';

import { createEngineProjectBackend } from './project-backend.engine';
import { createEngineProjectHeadingBackend } from './project-heading-backend.engine';
import { createEngineTaskBackend } from './task-backend.engine';

const USER = 'user-1';
const WEEKLY = { unit: 'week', interval: 1, anchor: 'scheduled' } as const;

async function open(hub: InMemorySyncHub, deviceId: string) {
  const engine = await openEngine({
    storage: await createNodeSqliteStorage(':memory:'),
    deviceId,
    transport: hub.transportFor(USER),
  });
  return {
    engine,
    projects: createEngineProjectBackend({ engine }),
    headings: createEngineProjectHeadingBackend({ engine }),
    tasks: createEngineTaskBackend({ engine }),
  };
}

/** 一个每周重复、带分组 / 任务 / Subtask 的项目。 */
async function seedRepeatingProject(device: Awaited<ReturnType<typeof open>>) {
  const { engine, projects, headings, tasks } = device;
  const project = await projects.createProject({
    title: '每周复盘',
    scheduledType: ScheduledType.DATE,
    scheduledDate: '2030-01-07',
    dueDate: '2030-01-09',
  });
  await projects.updateProject(project.id, { repeatRule: WEEKLY });
  const heading = await headings.createProjectHeading({ projectId: project.id, title: '准备' });
  const done = await tasks.createTask({ title: '回顾日历', projectId: project.id });
  await engine.update('task', done.id, { headingId: heading.id });
  await tasks.createSubtask(done.id, { title: '看下周' });
  await tasks.completeTask(done.id);
  const open = await tasks.createTask({
    title: '写总结',
    projectId: project.id,
    scheduledType: ScheduledType.DATE,
    scheduledDate: '2030-01-08',
  });
  return { project, heading, done, open };
}

describe('重复项目（Engine 后端）', () => {
  let hub: InMemorySyncHub;
  let device: Awaited<ReturnType<typeof open>>;

  beforeEach(async () => {
    hub = new InMemorySyncHub();
    device = await open(hub, 'dev-test');
  });

  it('规则只在 DATE 项目上保留，移入 Someday 清除', async () => {
    const { project } = await seedRepeatingProject(device);
    expect((await device.projects.getProject(project.id)).repeatRule).toEqual(WEEKLY);
    const someday = await device.projects.updateProject(project.id, {
      scheduledType: ScheduledType.SOMEDAY,
    });
    expect(someday.repeatRule).toBeNull();
  });

  it('完成：了结剩余任务，派生出整份重置的下一轮，紧跟来源项目', async () => {
    const { project, open: openTask } = await seedRepeatingProject(device);
    const other = await device.projects.createProject({ title: '其他' });

    await device.projects.completeProject(project.id, { settleRemaining: 'cancelled' });
    expect((await device.tasks.getTask(openTask.id)).status).toBe(TaskStatus.CANCELLED);

    const all = await device.projects.getProjects();
    expect(all.map((p) => p.title)).toEqual(['每周复盘', '每周复盘', '其他']);
    const next = all[1];
    expect(next.id).not.toBe(project.id);
    expect(next).toMatchObject({
      status: ProjectStatus.ACTIVE,
      scheduledDate: '2030-01-14',
      dueDate: '2030-01-16',
      repeatRule: WEEKLY,
      repeatSourceId: project.id,
      taskTotalCount: 2,
      taskCompletedCount: 0,
    });
    expect(other.id).toBe(all[2].id);

    const [nextHeading] = await device.headings.getProjectHeadings(next.id);
    expect(nextHeading).toMatchObject({ title: '准备', status: HeadingStatus.ACTIVE });
    const nextTasks = await device.tasks.getTasks({ projectId: next.id });
    expect(nextTasks.map((t) => [t.title, t.status, t.scheduledDate])).toEqual(
      expect.arrayContaining([
        ['回顾日历', TaskStatus.ACTIVE, null],
        ['写总结', TaskStatus.ACTIVE, '2030-01-15'],
      ]),
    );
    const review = nextTasks.find((t) => t.title === '回顾日历')!;
    expect(review.headingId).toBe(nextHeading.id);
    const subtasks = await device.engine.list('subtask', { where: { taskId: review.id } });
    expect(subtasks.map((s) => [s.fields.title, s.fields.status])).toEqual([
      ['看下周', TaskStatus.ACTIVE],
    ]);
  });

  it('重开后再完成不重复派生', async () => {
    const { project } = await seedRepeatingProject(device);
    await device.projects.completeProject(project.id);
    await device.projects.uncompleteProject(project.id);
    await device.projects.completeProject(project.id);
    expect(
      (await device.projects.getProjects()).filter((p) => p.title === '每周复盘'),
    ).toHaveLength(2);
  });

  it('跳过本次：项目与未了结任务的日期一起推进；下一轮已存在时不可跳过', async () => {
    const { project, open: openTask, done } = await seedRepeatingProject(device);
    const skipped = await device.projects.skipProject(project.id);
    expect(skipped).toMatchObject({ scheduledDate: '2030-01-14', dueDate: '2030-01-16' });
    expect((await device.tasks.getTask(openTask.id)).scheduledDate).toBe('2030-01-15');
    expect((await device.tasks.getTask(done.id)).status).toBe(TaskStatus.COMPLETED);
    expect(
      (await device.projects.getProjects()).filter((p) => p.title === '每周复盘'),
    ).toHaveLength(1);

    await device.projects.completeProject(project.id);
    await device.projects.uncompleteProject(project.id);
    await expect(device.projects.skipProject(project.id)).rejects.toBeInstanceOf(
      RepeatSkipBlockedError,
    );
  });

  it('两台离线设备并发完成：同步后只有一个下一轮，任务不重复', async () => {
    const b = await open(hub, 'dev-b');
    const { project } = await seedRepeatingProject(device);
    await device.engine.sync();
    await b.engine.sync();

    await device.projects.completeProject(project.id);
    await b.projects.completeProject(project.id);
    await device.engine.sync();
    await b.engine.sync();
    await device.engine.sync();

    for (const side of [device, b]) {
      const instances = (await side.projects.getProjects()).filter(
        (p) => p.repeatSourceId === project.id,
      );
      expect(instances).toHaveLength(1);
      expect(await side.tasks.getTasks({ projectId: instances[0].id })).toHaveLength(2);
      expect(await side.headings.getProjectHeadings(instances[0].id)).toHaveLength(1);
    }
    await b.engine.close();
  });
});
