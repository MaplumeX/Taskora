/**
 * AttachmentsService 写路径（真实 Postgres + 真实 Sync Hub，ADR-0019）。
 *
 * REST 写附件元数据经合并器落库、与变更日志同事务；归属经父 Task 认领；
 * 内容字段不可改；删除 Task 时级联登记附件。
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeEach, expect, it } from 'vitest';

import { deriveAttachmentId, deriveRepeatCopyId } from '@taskora/engine';

import { disconnectTestDb, testPrisma } from './db';
import {
  compactedIdsInLog,
  createHarness,
  dbDescribe,
  expectLoggedAsStored,
  OTHER_USER,
  registeredCompacted,
  USER,
} from './rest-writes.harness';

type Harness = Awaited<ReturnType<typeof createHarness>>;

const HASH = 'a'.repeat(64);
const file = (name: string, id?: string) => ({
  ...(id ? { id } : {}),
  name,
  mimeType: 'application/pdf',
  size: 10,
  blobHash: HASH,
});

async function seedTask(id: string, userId = USER) {
  return testPrisma.task.create({ data: { id, userId, title: '任务' } });
}

dbDescribe('AttachmentsService 写路径（真实 Postgres）', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('create：元数据落库并入日志，追加在末尾；同 id 重试幂等，跨任务冲突', async () => {
    await seedTask('task-1');
    await seedTask('task-2');
    const first = await h.attachments.create(
      USER,
      'task-1',
      file('a.pdf', '00000000-0000-4000-8000-000000000001'),
    );
    const second = await h.attachments.create(USER, 'task-1', file('b.pdf'));
    expect(first).toMatchObject({ taskId: 'task-1', name: 'a.pdf', size: 10, blobHash: HASH });
    expect(second.position! > first.position!).toBe(true);
    await expectLoggedAsStored('attachment', first.id);

    const retried = await h.attachments.create(USER, 'task-1', file('a.pdf', first.id));
    expect(retried.id).toBe(first.id);
    expect(await testPrisma.attachment.count()).toBe(2);
    await expect(
      h.attachments.create(USER, 'task-2', file('a.pdf', first.id)),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('他人的任务 / 附件 → 404，不写', async () => {
    await seedTask('foreign', OTHER_USER);
    await expect(h.attachments.create(USER, 'foreign', file('x.pdf'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const theirs = await testPrisma.attachment.create({
      data: { taskId: 'foreign', name: 'theirs.pdf', blobHash: HASH },
    });
    await expect(h.attachments.update(USER, theirs.id, { name: 'mine' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(h.attachments.remove(USER, theirs.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await testPrisma.attachment.findUniqueOrThrow({ where: { id: theirs.id } })).name).toBe(
      'theirs.pdf',
    );
  });

  it('rename / reorder / remove；任务详情带上按位次排序的附件', async () => {
    await seedTask('task-1');
    const a = await h.attachments.create(USER, 'task-1', file('a.pdf'));
    const b = await h.attachments.create(USER, 'task-1', file('b.pdf'));

    expect((await h.attachments.update(USER, a.id, { name: '合同.pdf' })).name).toBe('合同.pdf');
    await h.attachments.reorder(USER, 'task-1', [b.id, a.id]);
    const detail = await h.tasks.findOne(USER, 'task-1');
    expect(detail.attachments.map((item) => item.id)).toEqual([b.id, a.id]);

    await h.attachments.remove(USER, a.id);
    expect(await testPrisma.attachment.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await registeredCompacted('attachment')).toEqual([a.id]);
    expect(await compactedIdsInLog('attachment')).toEqual([a.id]);
  });

  it('完成重复任务：派生实例复制附件（确定性 id，指向同一 Blob），入日志', async () => {
    await testPrisma.task.create({
      data: {
        id: 'task-1',
        userId: USER,
        title: '月报',
        scheduledType: 'DATE',
        scheduledDate: new Date('2026-02-05T00:00:00Z'),
        bucket: 'SCHEDULED',
        repeatRule: JSON.stringify({ unit: 'day', interval: 1, anchor: 'scheduled' }),
      },
    });
    await h.attachments.create(USER, 'task-1', file('模板.docx'));
    await h.tasks.complete(USER, 'task-1');

    const instance = await testPrisma.task.findFirstOrThrow({
      where: { repeatSourceId: 'task-1' },
    });
    const copies = await testPrisma.attachment.findMany({ where: { taskId: instance.id } });
    expect(copies.map((row) => [row.id, row.name, row.blobHash])).toEqual([
      [deriveAttachmentId(instance.id, 0), '模板.docx', HASH],
    ]);
    await expectLoggedAsStored('attachment', copies[0].id);
  });

  it('完成重复项目：下一轮的任务带上附件副本', async () => {
    await testPrisma.project.create({
      data: {
        id: 'p-1',
        userId: USER,
        title: '周报',
        scheduledType: 'DATE',
        scheduledDate: new Date('2026-02-05T00:00:00Z'),
        bucket: 'SCHEDULED',
        repeatRule: JSON.stringify({ unit: 'week', interval: 1, anchor: 'scheduled' }),
      },
    });
    await testPrisma.task.create({
      data: { id: 'pt-1', userId: USER, title: '汇总', projectId: 'p-1', bucket: 'ANYTIME' },
    });
    await h.attachments.create(USER, 'pt-1', file('数据.xlsx'));
    await h.projects.complete(USER, 'p-1');

    const next = await testPrisma.project.findFirstOrThrow({ where: { repeatSourceId: 'p-1' } });
    const copiedTask = deriveRepeatCopyId(next.id, 'task', 'pt-1');
    const copies = await testPrisma.attachment.findMany({ where: { taskId: copiedTask } });
    expect(copies.map((row) => [row.name, row.blobHash])).toEqual([['数据.xlsx', HASH]]);
  });

  it('清空 Trash 物理删除任务时级联登记并广播附件', async () => {
    await testPrisma.task.create({
      data: { id: 'trashed', userId: USER, title: '垃圾', trashedAt: new Date() },
    });
    const attachment = await h.attachments.create(USER, 'trashed', file('x.pdf'));
    await h.feed.emptyTrash(USER);
    expect(await testPrisma.attachment.count()).toBe(0);
    expect(await registeredCompacted('attachment')).toEqual([attachment.id]);
    expect(await compactedIdsInLog('attachment')).toEqual([attachment.id]);
  });
});
