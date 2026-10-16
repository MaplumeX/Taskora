/**
 * 数据包导入（`.scratch/data-import` issue 03，真实 Postgres + 临时目录里的
 * Blob 存储）：往返一致、导入非空账号不动现有数据、原子性、错误码、
 * 重复导入提示、设备能 pull 到导入的数据。
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Start } from '@taskora/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { ZipFile } from 'yazl';

import { AppModule } from '../src/app.module';
import { AreasService } from '../src/areas/areas.service';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { BlobStore } from '../src/blobs/blob-store';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DataPackageService } from '../src/data-package/data-package.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProjectHeadingsService } from '../src/project-headings/project-headings.service';
import { ProjectsService } from '../src/projects/projects.service';
import { SubtasksService } from '../src/subtasks/subtasks.service';
import { SyncChangeLog } from '../src/sync/sync-change-log';
import { TagsService } from '../src/tags/tags.service';
import { TasksService } from '../src/tasks/tasks.service';
import { disconnectTestDb, resetDb } from './db';
import { dbDescribe } from './rest-writes.harness';

const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function zipOf(entries: Record<string, Buffer | string>): Promise<Buffer> {
  const zip = new ZipFile();
  for (const [name, content] of Object.entries(entries)) {
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  zip.end();
  return streamToBuffer(zip.outputStream);
}

type Row = { id: string; fields: Record<string, unknown> };

dbDescribe('数据包导入（e2e）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let blobs: BlobStore;
  let exporter: DataPackageService;
  let log: SyncChangeLog;
  let s: {
    tasks: TasksService;
    projects: ProjectsService;
    headings: ProjectHeadingsService;
    areas: AreasService;
    tags: TagsService;
    subtasks: SubtasksService;
    attachments: AttachmentsService;
  };
  let dir: string;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };
  const content = Buffer.from('附件内容：发票 #42');
  const hash = sha256(content);

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'taskora-import-'));
    process.env.BLOB_STORAGE_DIR = dir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    blobs = moduleRef.get(BlobStore);
    exporter = moduleRef.get(DataPackageService);
    log = moduleRef.get(SyncChangeLog);
    s = {
      tasks: moduleRef.get(TasksService),
      projects: moduleRef.get(ProjectsService),
      headings: moduleRef.get(ProjectHeadingsService),
      areas: moduleRef.get(AreasService),
      tags: moduleRef.get(TagsService),
      subtasks: moduleRef.get(SubtasksService),
      attachments: moduleRef.get(AttachmentsService),
    };
  });

  beforeEach(async () => {
    await resetDb();
    rmSync(dir, { recursive: true, force: true });
    const user = async (email: string, preferences?: object) => {
      const row = await prisma.user.create({ data: { email, passwordHash: 'x', preferences } });
      return { id: row.id, token: jwt.sign({ sub: row.id }) };
    };
    alice = await user('alice@test', { timeZone: 'Asia/Shanghai' });
    bob = await user('bob@test', { timeZone: 'Europe/Berlin' });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.BLOB_STORAGE_DIR;
  });

  async function seed(userId: string) {
    const work = await s.tags.create(userId, { title: '工作' });
    const meeting = await s.tags.create(userId, { title: '会议', parentId: work.id });
    const area = await s.areas.create(userId, { title: '生活' });
    const project = await s.projects.create(userId, {
      title: '搬家',
      areaId: area.id,
      tagIds: [work.id],
    });
    const heading = await s.headings.create(userId, { projectId: project.id, title: '打包' });
    const boxes = await s.tasks.create(userId, {
      title: '买纸箱',
      projectId: project.id,
      tagIds: [meeting.id],
    });
    await s.tasks.update(userId, boxes.id, { headingId: heading.id });
    await s.subtasks.create(userId, boxes.id, { title: '量尺寸' });
    await blobs.put(userId, hash, Readable.from([content]));
    await s.attachments.create(userId, boxes.id, {
      name: '发票.pdf',
      mimeType: 'application/pdf',
      size: content.length,
      blobHash: hash,
    });
    const repeating = await s.tasks.create(userId, {
      title: '交房租',
      start: Start.DATE,
      scheduledDate: '2026-10-01',
    });
    await s.tasks.update(userId, repeating.id, {
      repeatRule: { unit: 'month', interval: 1, anchor: 'scheduled' },
    });
    await s.tasks.complete(userId, repeating.id);
    const trashed = await s.tasks.create(userId, { title: '已删' });
    await s.tasks.remove(userId, trashed.id);
    await s.tasks.create(userId, { title: 'Inbox 一', areaId: area.id });
    await prisma.calendarSubscription.create({
      data: { userId, name: '节假日', url: 'https://example.com/a.ics', color: 'red' },
    });
  }

  /**
   * 账号数据的规范形：去掉 id、时间戳与 Position 值，引用换成被引用行的
   * 标题，同类行按 Position 排序——两个账号的数据相同即规范形相同。
   */
  async function canonical(userId: string) {
    const { stream } = await exporter.exportPackage(userId, { includeBlobs: false });
    const { default: yauzl } = await import('yauzl');
    const buffer = await streamToBuffer(stream);
    const data = await new Promise<Record<string, Row[]>>((resolve, reject) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
        if (error) return reject(error);
        zip.on('entry', (entry: yauzl.Entry) => {
          if (entry.fileName !== 'data.json') return zip.readEntry();
          zip.openReadStream(entry, (err, read) => {
            if (err) return reject(err);
            void streamToBuffer(read).then((json) =>
              resolve(
                (JSON.parse(json.toString()) as { entities: Record<string, Row[]> }).entities,
              ),
            );
          });
        });
        zip.readEntry();
      });
    });
    const titleOf = new Map<string, string>();
    for (const rows of Object.values(data)) {
      for (const row of rows) titleOf.set(row.id, String(row.fields.title ?? row.fields.name));
    }
    const ref = (value: unknown) =>
      Array.isArray(value)
        ? value.map((id) => titleOf.get(id as string)).sort()
        : typeof value === 'string'
          ? (titleOf.get(value) ?? '<dangling>')
          : value;
    const refFields = [
      'projectId',
      'headingId',
      'areaId',
      'tagIds',
      'parentId',
      'taskId',
      'repeatSourceId',
    ];
    const result: Record<string, unknown[]> = {};
    for (const [entity, rows] of Object.entries(data)) {
      result[entity] = [...rows]
        .sort((a, b) =>
          String(a.fields.position ?? '') < String(b.fields.position ?? '')
            ? -1
            : String(a.fields.position ?? '') > String(b.fields.position ?? '')
              ? 1
              : String(a.fields.title).localeCompare(String(b.fields.title)),
        )
        .map(({ fields }) => {
          const out: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(fields)) {
            if (['position', 'feedPosition', 'updatedAt', 'createdAt'].includes(key)) continue;
            out[key] = refFields.includes(key) ? ref(value) : value;
          }
          return out;
        });
    }
    return result;
  }

  const exportAs = async (token: string) =>
    (
      await request(app.getHttpServer())
        .get('/api/v1/users/me/export')
        .set('Authorization', `Bearer ${token}`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
    ).body as Buffer;

  const preview = (token: string, file: Buffer) =>
    request(app.getHttpServer())
      .post('/api/v1/users/me/import/preview')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(file);

  const runImport = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/users/me/import')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('往返：导出 → 导入空账号，数据（含附件内容）一致；偏好默认不导入', async () => {
    await seed(alice.id);
    const file = await exportAs(alice.token);

    const previewed = await preview(bob.token, file).expect(200);
    expect(previewed.body).toMatchObject({
      uploadId: expect.any(String),
      manifest: { format: 1, includesBlobs: true, counts: { task: 5, blobs: 1 } },
      alreadyImportedAt: null,
    });

    const imported = await runImport(bob.token, { uploadId: previewed.body.uploadId }).expect(200);
    expect(imported.body).toMatchObject({
      created: { task: 5, tag: 2, attachment: 1, calendarSubscriptions: 1 },
      mergedTags: 0,
      skipped: {},
    });

    expect(await canonical(bob.id)).toEqual(await canonical(alice.id));
    expect(await streamToBuffer(blobs.read(bob.id, hash))).toEqual(content);
    const bobUser = await prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
    expect(bobUser.preferences).toEqual({ timeZone: 'Europe/Berlin' });
    expect(await prisma.calendarSubscription.count({ where: { userId: bob.id } })).toBe(1);

    // 上传用完即删
    await runImport(bob.token, { uploadId: previewed.body.uploadId }).expect(404);
  });

  it('导入的行进入变更日志，设备能 pull 到', async () => {
    await seed(alice.id);
    const file = await exportAs(alice.token);
    // 设备已同步到 bob 现有的数据
    await s.tasks.create(bob.id, { title: 'bob 的任务' });
    const cursor = await log.currentSeq(bob.id);
    const { body } = await preview(bob.token, file).expect(200);
    await runImport(bob.token, { uploadId: body.uploadId }).expect(200);
    const pulled = await log.pull(bob.id, cursor);
    expect(pulled.resync).toBe(false);
    const taskIds = new Set(
      (
        await prisma.task.findMany({
          where: { userId: bob.id, title: { not: 'bob 的任务' } },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    const pulledTaskIds = new Set(
      pulled.changes.filter((c) => c.entity === 'task').map((c) => c.id),
    );
    expect(pulledTaskIds).toEqual(taskIds);
  });

  it('导入非空账号：现有数据不变，同名 Tag 合并，导入项排在末尾；重复导入有提示', async () => {
    await seed(alice.id);
    const before = await prisma.task.findMany({ where: { userId: alice.id } });
    const lastBefore = before
      .map((t) => t.position!)
      .sort()
      .at(-1)!;
    const file = await exportAs(alice.token);

    const first = await preview(alice.token, file).expect(200);
    const imported = await runImport(alice.token, {
      uploadId: first.body.uploadId,
      importPreferences: true,
    }).expect(200);
    expect(imported.body).toMatchObject({ mergedTags: 2, skipped: { 'duplicate-calendar': 1 } });
    expect(imported.body.created.tag).toBeUndefined();

    for (const row of before) {
      const now = await prisma.task.findUniqueOrThrow({ where: { id: row.id } });
      expect({ ...now, updatedAt: null, fieldClocks: null }).toEqual({
        ...row,
        updatedAt: null,
        fieldClocks: null,
      });
    }
    expect(await prisma.tag.count({ where: { userId: alice.id } })).toBe(2);
    const added = await prisma.task.findMany({
      where: { userId: alice.id, id: { notIn: before.map((t) => t.id) } },
    });
    expect(added).toHaveLength(before.length);
    for (const row of added) expect(row.position! > lastBefore).toBe(true);

    const second = await preview(alice.token, file).expect(200);
    expect(second.body.alreadyImportedAt).toEqual(expect.any(String));
  });

  it('importPreferences：用数据包偏好覆盖', async () => {
    await seed(alice.id);
    const file = await exportAs(alice.token);
    const { body } = await preview(bob.token, file).expect(200);
    await runImport(bob.token, { uploadId: body.uploadId, importPreferences: true }).expect(200);
    const bobUser = await prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
    expect(bobUser.preferences).toEqual({ timeZone: 'Asia/Shanghai' });
  });

  it('原子性：附件文件损坏时整次导入失败，账号无新行', async () => {
    const manifest = {
      format: 1,
      exportId: 'e1',
      exportedAt: '2026-10-16T00:00:00.000Z',
      hubVersion: 'x',
      includesBlobs: true,
      counts: {},
    };
    const data = {
      entities: {
        task: [{ id: 'k1', fields: { title: '有附件' } }],
        attachment: [{ id: 'f1', fields: { name: 'f', taskId: 'k1', blobHash: hash } }],
      },
      preferences: null,
      calendarSubscriptions: [],
    };
    const file = await zipOf({
      'manifest.json': JSON.stringify(manifest),
      'data.json': JSON.stringify(data),
      [`blobs/${hash}`]: Buffer.from('被篡改的内容'),
    });
    const { body } = await preview(bob.token, file).expect(200);
    const res = await runImport(bob.token, { uploadId: body.uploadId }).expect(422);
    expect(res.body.message).toBe('blob-mismatch');
    expect(await prisma.task.count({ where: { userId: bob.id } })).toBe(0);
    expect(await prisma.dataImport.count({ where: { userId: bob.id } })).toBe(0);
  });

  it('错误：非 zip、缺 manifest、format 过新 → 422 + 错误码；未知 uploadId → 404', async () => {
    const invalid = await preview(bob.token, Buffer.from('not a zip')).expect(422);
    expect(invalid.body.message).toBe('invalid-package');

    const noManifest = await preview(bob.token, await zipOf({ 'data.json': '{}' })).expect(422);
    expect(noManifest.body.message).toBe('invalid-package');

    const future = await preview(
      bob.token,
      await zipOf({
        'manifest.json': JSON.stringify({ format: 99 }),
        'data.json': JSON.stringify({ entities: {} }),
      }),
    ).expect(422);
    expect(future.body.message).toBe('unsupported-format');

    await runImport(bob.token, { uploadId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    await runImport(bob.token, { uploadId: 'nope' }).expect(400);
  });

  /** 旧版 `GET /users/me/export` 的输出（format 0），查询照搬已移除的实现。 */
  async function legacyExport(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, avatarUrl: true, preferences: true },
    });
    const [tasks, projects, areas, tags, projectHeadings] = await Promise.all([
      prisma.task.findMany({ where: { userId }, include: { subtasks: true, tags: true } }),
      prisma.project.findMany({ where: { userId }, include: { tags: true } }),
      prisma.area.findMany({ where: { userId }, include: { tags: true } }),
      prisma.tag.findMany({ where: { userId } }),
      prisma.projectHeading.findMany({ where: { userId } }),
    ]);
    return Buffer.from(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          version: '0.1.0',
          user,
          tasks,
          projects,
          areas,
          tags,
          projectHeadings,
        },
        null,
        2,
      ),
    );
  }

  it('旧版 JSON 导出（format 0）：迁移后完整导入，重复导入有提示', async () => {
    await seed(alice.id);
    const file = await legacyExport(alice.id);

    const previewed = await preview(bob.token, file).expect(200);
    expect(previewed.body.manifest).toMatchObject({
      format: 1,
      hubVersion: '0.1.0',
      includesBlobs: false,
      counts: { task: 5, subtask: 1, tag: 2 },
    });
    await runImport(bob.token, {
      uploadId: previewed.body.uploadId,
      importPreferences: true,
    }).expect(200);

    const [mine, theirs] = [await canonical(alice.id), await canonical(bob.id)];
    // 旧版不含附件与日历订阅
    expect(theirs.attachment).toEqual([]);
    expect({ ...theirs, attachment: null }).toEqual({ ...mine, attachment: null });
    const bobUser = await prisma.user.findUniqueOrThrow({ where: { id: bob.id } });
    expect(bobUser.preferences).toEqual({ timeZone: 'Asia/Shanghai' });

    const again = await preview(bob.token, file).expect(200);
    expect(again.body.alreadyImportedAt).toEqual(expect.any(String));
  });

  it('不能导入别人的上传', async () => {
    await seed(alice.id);
    const file = await exportAs(alice.token);
    const { body } = await preview(alice.token, file).expect(200);
    await runImport(bob.token, { uploadId: body.uploadId }).expect(404);
  });
});
