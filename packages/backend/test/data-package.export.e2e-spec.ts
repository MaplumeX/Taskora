/**
 * 数据包导出（`.scratch/data-import` issue 01，真实 Postgres + 临时目录里的
 * Blob 存储）：zip 结构、wire 字段、附件文件、排除项、按用户隔离。
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { SYNC_ENTITIES } from '@taskora/engine';
import {
  DATA_PACKAGE_FORMAT,
  type DataPackageData,
  type DataPackageManifest,
} from '@taskora/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import yauzl from 'yauzl';

import { AppModule } from '../src/app.module';
import { BlobStore } from '../src/blobs/blob-store';
import { PrismaService } from '../src/prisma/prisma.service';
import { disconnectTestDb, resetDb } from './db';
import { dbDescribe } from './rest-writes.harness';

const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

/** 解出 zip 的全部条目：路径 → 内容。 */
async function unzip(buffer: Buffer): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, file) =>
      error ? reject(error) : resolve(file),
    ),
  );
  const entries = new Map<string, Buffer>();
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          entries.set(entry.fileName, Buffer.concat(chunks));
          zip.readEntry();
        });
      });
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });
  return entries;
}

dbDescribe('数据包导出（e2e）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let blobs: BlobStore;
  let dir: string;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };
  const content = Buffer.from('附件内容：发票 #42');
  const hash = sha256(content);

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'taskora-export-'));
    process.env.BLOB_STORAGE_DIR = dir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    blobs = moduleRef.get(BlobStore);
  });

  beforeEach(async () => {
    await resetDb();
    rmSync(dir, { recursive: true, force: true });
    const user = async (email: string, preferences?: object) => {
      const row = await prisma.user.create({ data: { email, passwordHash: 'x', preferences } });
      return { id: row.id, token: jwt.sign({ sub: row.id }) };
    };
    alice = await user('alice@test', { timeZone: 'Asia/Shanghai' });
    bob = await user('bob@test');
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.BLOB_STORAGE_DIR;
  });

  async function seedAlice() {
    const tag = await prisma.tag.create({ data: { userId: alice.id, title: '工作' } });
    const area = await prisma.area.create({ data: { userId: alice.id, title: '生活' } });
    const project = await prisma.project.create({
      data: { userId: alice.id, title: '搬家', areaId: area.id },
    });
    const heading = await prisma.projectHeading.create({
      data: { userId: alice.id, projectId: project.id, title: '打包' },
    });
    const task = await prisma.task.create({
      data: {
        userId: alice.id,
        title: '买纸箱',
        projectId: project.id,
        headingId: heading.id,
        tags: { create: [{ tagId: tag.id }] },
      },
    });
    await prisma.task.create({
      data: { userId: alice.id, title: '已删', trashedAt: new Date() },
    });
    await prisma.subtask.create({ data: { taskId: task.id, title: '量尺寸' } });
    await prisma.attachment.create({
      data: { taskId: task.id, name: '发票.pdf', size: content.length, blobHash: hash },
    });
    // 两个附件引用同一内容 + 一个文件还没传上来的附件
    await prisma.attachment.create({
      data: { taskId: task.id, name: '副本.pdf', size: content.length, blobHash: hash },
    });
    await prisma.attachment.create({
      data: { taskId: task.id, name: '缺失.pdf', size: 1, blobHash: 'b'.repeat(64) },
    });
    await blobs.put(alice.id, hash, Readable.from([content]));
    await prisma.calendarSubscription.create({
      data: { userId: alice.id, name: '节假日', url: 'https://example.com/a.ics', color: 'red' },
    });
    await prisma.agentConfig.create({
      data: { userId: alice.id, provider: 'anthropic', modelId: 'm', apiKeyEncrypted: 'secret' },
    });
    await prisma.task.create({ data: { userId: bob.id, title: 'bob 的任务' } });
    return { task };
  }

  const exportAs = (token: string, query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/users/me/export${query}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('导出 zip：manifest、wire 字段、附件文件去重，缺失的 blob 不打包', async () => {
    const { task } = await seedAlice();
    const res = await exportAs(alice.token);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="taskora-\d{4}-\d{2}-\d{2}\.taskora"$/,
    );

    const entries = await unzip(res.body as Buffer);
    expect([...entries.keys()].sort()).toEqual(['blobs/' + hash, 'data.json', 'manifest.json']);
    expect(entries.get('blobs/' + hash)).toEqual(content);

    const manifest = JSON.parse(entries.get('manifest.json')!.toString()) as DataPackageManifest;
    expect(manifest).toMatchObject({
      format: DATA_PACKAGE_FORMAT,
      exportId: expect.any(String),
      includesBlobs: true,
      counts: {
        task: 2,
        subtask: 1,
        attachment: 3,
        project: 1,
        'project-heading': 1,
        area: 1,
        tag: 1,
        calendarSubscriptions: 1,
        blobs: 1,
      },
    });

    const data = JSON.parse(entries.get('data.json')!.toString()) as DataPackageData;
    expect(Object.keys(data.entities).sort()).toEqual([...SYNC_ENTITIES].sort());
    const exported = data.entities.task.find((row) => row.id === task.id)!;
    expect(exported.fields).toMatchObject({ title: '买纸箱', tagIds: [expect.any(String)] });
    expect(exported.fields).not.toHaveProperty('userId');
    expect(exported.fields).not.toHaveProperty('fieldClocks');
    expect(data.preferences).toEqual({ timeZone: 'Asia/Shanghai' });
    expect(data.calendarSubscriptions).toEqual([
      { name: '节假日', url: 'https://example.com/a.ics', color: 'red', enabled: true },
    ]);

    const text = entries.get('data.json')!.toString();
    expect(text).not.toContain('secret');
    expect(text).not.toContain('alice@test');
    expect(text).not.toContain('bob 的任务');
  });

  it('blobs=0 不含附件文件', async () => {
    await seedAlice();
    const res = await exportAs(alice.token, '?blobs=0');
    const entries = await unzip(res.body as Buffer);
    expect([...entries.keys()].sort()).toEqual(['data.json', 'manifest.json']);
    const manifest = JSON.parse(entries.get('manifest.json')!.toString()) as DataPackageManifest;
    expect(manifest.includesBlobs).toBe(false);
    expect(manifest.counts.blobs).toBe(0);
    expect(manifest.counts.attachment).toBe(3);
  });

  it('未登录 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me/export').expect(401);
  });
});
