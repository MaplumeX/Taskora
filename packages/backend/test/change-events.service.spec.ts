import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ChangeEvent } from '@taskora/shared';

import { AppModule } from '../src/app.module';
import { ChangeEventCollector } from '../src/events/change-event.collector';
import { ChangeEventHub } from '../src/events/change-event-hub.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AreasService } from '../src/areas/areas.service';
import { FeedService } from '../src/feed/feed.service';
import { ProjectsService } from '../src/projects/projects.service';
import { SubtasksService } from '../src/subtasks/subtasks.service';
import { TagsService } from '../src/tags/tags.service';
import { TasksService } from '../src/tasks/tasks.service';

import { disconnectTestDb, resetDb } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;

const integrationDescribe = hasTestDb ? describe : describe.skip;

/**
 * Prisma extension + hub integration seam: run real service writes against
 * the test database and assert the Change Events that come out — actions,
 * payload shapes, seq monotonicity, transaction merging, TaskTag→parent
 * mapping and soft/hard-delete classification.
 */
integrationDescribe('Change Events (service-level integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hub: ChangeEventHub;
  let collector: ChangeEventCollector;
  let tasks: TasksService;
  let projects: ProjectsService;
  let areas: AreasService;
  let tags: TagsService;
  let subtasks: SubtasksService;
  let feed: FeedService;

  let userId: string;
  let events: ChangeEvent[];
  let mark: number;

  const record = (event: ChangeEvent) => events.push(event);

  /** Flush pending descriptors; return events published since last drain. */
  const drain = async (): Promise<ChangeEvent[]> => {
    await collector.flush();
    const fresh = events.slice(mark);
    mark = events.length;
    return fresh;
  };

  /** Freshly drained events matching a predicate. */
  const drainWhere = async (predicate: (e: ChangeEvent) => boolean) =>
    (await drain()).filter(predicate);

  const expectSeqsMonotonic = (batch: ChangeEvent[]) => {
    for (let i = 1; i < batch.length; i += 1) {
      expect(batch[i].seq).toBeGreaterThan(batch[i - 1].seq);
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    hub = moduleRef.get(ChangeEventHub);
    collector = moduleRef.get(ChangeEventCollector);
    tasks = moduleRef.get(TasksService);
    projects = moduleRef.get(ProjectsService);
    areas = moduleRef.get(AreasService);
    tags = moduleRef.get(TagsService);
    subtasks = moduleRef.get(SubtasksService);
    feed = moduleRef.get(FeedService);
  });

  beforeEach(async () => {
    await resetDb();
    hub.clear();
    events = [];
    mark = 0;

    const user = await prisma.user.create({
      data: { email: 'events@test.local', passwordHash: 'hash' },
    });
    userId = user.id;
    hub.subscribe(userId, undefined, record);
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
  });

  it('emits created with the list-DTO payload shape (embedded tags, no subtasks)', async () => {
    const tag = await tags.create(userId, { title: 'Urgent', color: '#FF0000' });
    const task = await tasks.create(userId, {
      title: 'Write spec',
      tagIds: [tag.id],
    });

    const batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    expect(batch).toHaveLength(1);
    const event = batch[0];
    expect(event.action).toBe('created');

    // List-DTO shape: embedded tags, NO subtasks, ISO date strings.
    expect(event.data).toMatchObject({ id: task.id, title: 'Write spec', userId });
    expect(event.data?.tags).toEqual([
      expect.objectContaining({ id: tag.id, title: 'Urgent', color: '#FF0000' }),
    ]);
    expect(event.data).not.toHaveProperty('subtasks');
    expect(typeof event.data?.createdAt).toBe('string');
    expect(typeof event.data?.updatedAt).toBe('string');
  });

  it('emits repeatRule as a parsed object in task payloads (mirrors HTTP read DTO)', async () => {
    // 回归：repeatRule 是 TEXT JSON 列，payload 若漏过 withRepeatRuleDto
    // 会把字符串透传给客户端 detail 缓存（读 DTO 形状违约），导致前端
    // 重复规则编辑器 normalizeRepeatRule 判 null、开关永不勾选。
    const task = await tasks.create(userId, {
      title: 'Recurring',
      scheduledType: 'DATE',
      scheduledDate: '2026-09-25T00:00:00.000Z',
    });
    await drain();

    await tasks.update(userId, task.id, {
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    let batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    const rule = batch.at(-1)?.data?.repeatRule;
    expect(typeof rule).toBe('object');
    expect(rule).toMatchObject({ unit: 'week', interval: 1, anchor: 'scheduled' });

    // 清除规则 → null（而不是字符串 "null" 或残留文本）。
    await tasks.update(userId, task.id, { repeatRule: null });
    batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    expect(batch.at(-1)?.data?.repeatRule).toBeNull();
  });

  it('classifies update/complete/trash/restore as updated (soft-delete semantics)', async () => {
    const task = await tasks.create(userId, { title: 'T1' });
    await drain();

    await tasks.update(userId, task.id, { title: 'T1 renamed' });
    let batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    expect(batch.at(-1)).toMatchObject({ action: 'updated' });
    expect(batch.at(-1)?.data?.title).toBe('T1 renamed');

    await tasks.complete(userId, task.id);
    batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    expect(batch.at(-1)).toMatchObject({ action: 'updated' });
    expect(batch.at(-1)?.data?.status).toBe('COMPLETED');
    expect(batch.at(-1)?.data?.completedAt).toBeTruthy();

    // Trash is an update, not a delete.
    await tasks.remove(userId, task.id);
    batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    expect(batch.at(-1)?.action).toBe('updated');
    expect(batch.at(-1)?.data?.trashedAt).toBeTruthy();

    await tasks.restore(userId, task.id);
    batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    expect(batch.at(-1)?.action).toBe('updated');
    expect(batch.at(-1)?.data?.trashedAt).toBeNull();
  });

  it('maps TaskTag relation writes to the parent task and merges them into one event', async () => {
    const tagA = await tags.create(userId, { title: 'A' });
    const tagB = await tags.create(userId, { title: 'B' });
    const task = await tasks.create(userId, { title: 'Tagged', tagIds: [tagA.id] });
    await drain();

    // update(tagIds) runs deleteMany + createMany on TaskTag inside an
    // array transaction (merged into one task event), followed by the
    // task.update itself — a separate write flushed separately. The burst
    // is coalesced again by the client's ~50ms apply window; what matters
    // here is that every event carries `updated` and the final tag set.
    await tasks.update(userId, task.id, { tagIds: [tagB.id] });

    const batch = await drainWhere((e) => e.entity === 'task' && e.id === task.id);
    expect(batch.length).toBeGreaterThanOrEqual(1);
    for (const event of batch) {
      expect(event.action).toBe('updated');
      expect(event.data?.tags.map((t) => t.id)).toEqual([tagB.id]);
    }
  });

  it('emits one updated event per task for reorders, with monotonic seqs', async () => {
    const t1 = await tasks.create(userId, { title: 'r1' });
    const t2 = await tasks.create(userId, { title: 'r2' });
    const t3 = await tasks.create(userId, { title: 'r3' });
    await drain();

    await tasks.reorder(userId, [t3.id, t1.id, t2.id]);

    const batch = await drainWhere((e) => e.entity === 'task' && e.action === 'updated');
    expect(batch.map((e) => e.id).sort()).toEqual([t1.id, t2.id, t3.id].sort());
    expectSeqsMonotonic(batch);
  });

  it('emits created/updated for their own entities (area, tag, subtask, project, heading, tag-group)', async () => {
    const area = await areas.create(userId, { title: 'Work' });
    const tag = await tags.create(userId, { title: 'T' });
    const project = await projects.create(userId, { title: 'P', areaId: area.id });
    const task = await tasks.create(userId, { title: 'In project', projectId: project.id });
    const subtask = await subtasks.create(userId, task.id, { title: 'Step' });
    const heading = await prisma.projectHeading.create({
      data: { projectId: project.id, title: 'H', userId },
    });
    const group = await prisma.tagGroup.create({
      data: { title: 'G', userId },
    });
    await drain();

    const find = (entity: string, id: string) =>
      events.find((e) => e.entity === entity && e.id === id);

    expect(find('area', area.id)).toMatchObject({ action: 'created' });
    expect(find('area', area.id)?.data).toMatchObject({ title: 'Work', tags: [] });
    expect(find('tag', tag.id)).toMatchObject({ action: 'created' });
    expect(find('project', project.id)).toMatchObject({ action: 'created' });
    expect(find('project', project.id)?.data?.areaId).toBe(area.id);
    expect(find('task', task.id)).toMatchObject({ action: 'created' });
    expect(find('subtask', subtask.id)).toMatchObject({ action: 'created' });
    expect(find('subtask', subtask.id)?.data).toMatchObject({ taskId: task.id });
    expect(find('project-heading', heading.id)).toMatchObject({ action: 'created' });
    expect(find('tag-group', group.id)).toMatchObject({ action: 'created' });
  });

  it('cascades project trash as updated events for its tasks', async () => {
    const project = await projects.create(userId, { title: 'P' });
    const task = await tasks.create(userId, { title: 'T', projectId: project.id });
    await drain();

    await projects.remove(userId, project.id);

    const batch = await drain();
    const taskEvent = batch.find((e) => e.entity === 'task' && e.id === task.id);
    const projectEvent = batch.find((e) => e.entity === 'project' && e.id === project.id);
    expect(taskEvent).toMatchObject({ action: 'updated' });
    expect(taskEvent?.data?.trashedAt).toBeTruthy();
    expect(projectEvent).toMatchObject({ action: 'updated' });
    expect(projectEvent?.data?.trashedAt).toBeTruthy();
  });

  it('emits deleted (id only) for hard deletes via emptyTrash', async () => {
    const trashed = await tasks.create(userId, { title: 'Gone' });
    await tasks.remove(userId, trashed.id);
    await drain();

    await feed.emptyTrash(userId);

    expect(
      await prisma.compactedEntity.findUnique({
        where: { userId_entity_entityId: { userId, entity: 'task', entityId: trashed.id } },
      }),
    ).not.toBeNull();
    const batch = await drainWhere((e) => e.entity === 'task' && e.id === trashed.id);
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({ action: 'deleted', id: trashed.id });
    expect(batch[0]).not.toHaveProperty('data');
  });

  it('emits deleted for deleteMany with a plain where.id (project-heading paths)', async () => {
    const project = await projects.create(userId, { title: 'P' });
    const heading = await prisma.projectHeading.create({
      data: { projectId: project.id, title: 'H', userId },
    });
    await drain();

    // Same shape as ProjectHeadingsService archive/convert deletes.
    await prisma.projectHeading.deleteMany({
      where: { id: heading.id, userId, projectId: project.id },
    });

    const batch = await drainWhere((e) => e.entity === 'project-heading' && e.id === heading.id);
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({ action: 'deleted', id: heading.id });
    expect(batch[0]).not.toHaveProperty('data');
  });

  it('emits deleted for subtask hard deletes (routing through the parent task)', async () => {
    const task = await tasks.create(userId, { title: 'T' });
    const subtask = await subtasks.create(userId, task.id, { title: 'Step' });
    await drain();

    await subtasks.remove(userId, subtask.id);

    expect(
      await prisma.compactedEntity.findUnique({
        where: { userId_entity_entityId: { userId, entity: 'subtask', entityId: subtask.id } },
      }),
    ).not.toBeNull();
    const batch = await drainWhere((e) => e.entity === 'subtask' && e.id === subtask.id);
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({ action: 'deleted', id: subtask.id });
    expect(batch[0]).not.toHaveProperty('data');
  });

  it('emits created for the promoted tasks when converting a task to a project', async () => {
    const task = await tasks.create(userId, { title: 'Convert me' });
    const subtaskOne = await subtasks.create(userId, task.id, { title: 'Sub one' });
    const subtaskTwo = await subtasks.create(userId, task.id, { title: 'Sub two' });
    await drain();

    const project = await tasks.convertToProject(userId, task.id);

    const batch = await drain();
    const projectEvent = batch.find((e) => e.entity === 'project' && e.id === project.id);
    expect(projectEvent).toMatchObject({ action: 'created' });

    const taskDeleted = batch.find((e) => e.entity === 'task' && e.id === task.id);
    expect(taskDeleted).toMatchObject({ action: 'deleted' });
    expect(taskDeleted).not.toHaveProperty('data');
    const compacted = await prisma.compactedEntity.findMany({
      where: { userId, entityId: { in: [task.id, subtaskOne.id, subtaskTwo.id] } },
      select: { entity: true, entityId: true },
    });
    expect(compacted).toEqual(
      expect.arrayContaining([
        { entity: 'task', entityId: task.id },
        { entity: 'subtask', entityId: subtaskOne.id },
        { entity: 'subtask', entityId: subtaskTwo.id },
      ]),
    );

    const promoted = batch.filter(
      (e) => e.entity === 'task' && e.action === 'created' && e.data?.projectId === project.id,
    );
    expect(promoted).toHaveLength(2);
  });

  it('emits nothing when a transaction rolls back', async () => {
    await drain();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.task.create({
          data: { title: 'Doomed', userId },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    const batch = await drain();
    expect(batch.filter((e) => e.entity === 'task')).toHaveLength(0);
  });

  it('keeps seqs strictly increasing across a mixed workload', async () => {
    const t = await tasks.create(userId, { title: 'Seq probe' });
    await tasks.update(userId, t.id, { title: 'Seq probe 2' });
    await tasks.complete(userId, t.id);
    await areas.create(userId, { title: 'A' });

    const batch = await drain();
    expectSeqsMonotonic(batch);
  });
});
