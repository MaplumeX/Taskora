/**
 * Blob 通道（ADR-0019，真实 Postgres + 临时目录里的文件系统存储）：
 * 上传校验 hash、幂等、按用户隔离、Range、安全响应头；GC 宽限期。
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { BLOB_GC_GRACE_MS, BlobGcService } from '../src/blobs/blob-gc.service';
import { BlobStore } from '../src/blobs/blob-store';
import { parseRange } from '../src/blobs/blobs.controller';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { disconnectTestDb, resetDb } from './db';

const e2eDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

describe('parseRange', () => {
  it('单段范围、开放尾、后缀；多段与缺省回整份；不可满足为 null', () => {
    expect(parseRange('bytes=0-3', 10)).toEqual({ start: 0, end: 3 });
    expect(parseRange('bytes=4-', 10)).toEqual({ start: 4, end: 9 });
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange('bytes=8-100', 10)).toEqual({ start: 8, end: 9 });
    expect(parseRange(undefined, 10)).toBeUndefined();
    expect(parseRange('bytes=0-1,4-5', 10)).toBeUndefined();
    expect(parseRange('bytes=10-', 10)).toBeNull();
    expect(parseRange('bytes=5-2', 10)).toBeNull();
  });
});

e2eDescribe('Blob 通道（e2e）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let dir: string;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };
  const content = Buffer.from('附件内容：发票 #42');
  const hash = sha256(content);

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'taskora-blobs-'));
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
  });

  beforeEach(async () => {
    await resetDb();
    rmSync(dir, { recursive: true, force: true });
    const user = async (email: string) => {
      const row = await prisma.user.create({ data: { email, passwordHash: 'x' } });
      return { id: row.id, token: jwt.sign({ sub: row.id }) };
    };
    alice = await user('alice@test');
    bob = await user('bob@test');
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.BLOB_STORAGE_DIR;
  });

  const upload = (token: string, body: Buffer, as = hash) =>
    request(app.getHttpServer())
      .put(`/api/v1/blobs/${as}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(body);

  it('上传 → HEAD / GET 取回原样字节，带安全响应头；重复上传幂等', async () => {
    const res = await upload(alice.token, content).expect(200);
    expect(res.body).toEqual({ hash, size: content.length });
    await upload(alice.token, content).expect(200);

    const head = await request(app.getHttpServer())
      .head(`/api/v1/blobs/${hash}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(head.headers['content-length']).toBe(String(content.length));

    const get = await request(app.getHttpServer())
      .get(`/api/v1/blobs/${hash}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(get.body as Buffer, content)).toBe(0);
    expect(get.headers['content-type']).toBe('application/octet-stream');
    expect(get.headers['content-disposition']).toBe('attachment');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
  });

  it('Range：206 返回片段；不可满足 416', async () => {
    await upload(alice.token, content).expect(200);
    const partial = await request(app.getHttpServer())
      .get(`/api/v1/blobs/${hash}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .set('Range', 'bytes=0-2')
      .expect(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-2/${content.length}`);
    await request(app.getHttpServer())
      .get(`/api/v1/blobs/${hash}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .set('Range', `bytes=${content.length}-`)
      .expect(416);
  });

  it('内容与 hash 不符 → 400，不落盘；非法 hash → 400；JSON 请求体 → 415；未登录 401', async () => {
    await upload(alice.token, Buffer.from('别的内容')).expect(400);
    expect(await app.get(BlobStore).stat(alice.id, hash)).toBeNull();
    await upload(alice.token, content, '../../etc/passwd').expect(404);
    await upload(alice.token, content, 'A'.repeat(64)).expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/blobs/${hash}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ not: 'bytes' })
      .expect(415);
    await request(app.getHttpServer()).get(`/api/v1/blobs/${hash}`).expect(401);
  });

  it('按用户隔离：别人上传过同一内容，自己仍读不到（不跨用户去重）', async () => {
    await upload(bob.token, content).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/blobs/${hash}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .head(`/api/v1/blobs/${hash}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(404);
  });

  it('GC：只回收过了宽限期且没有附件引用的 Blob（引用按用户算）', async () => {
    const store = app.get(BlobStore);
    const orphan = Buffer.from('没人引用');
    await upload(alice.token, content).expect(200);
    await upload(alice.token, orphan, sha256(orphan)).expect(200);
    await upload(bob.token, content).expect(200);
    const task = await prisma.task.create({ data: { userId: alice.id, title: '带附件' } });
    await prisma.attachment.create({ data: { taskId: task.id, name: 'a', blobHash: hash } });
    const gc = app.get(BlobGcService);

    expect(await gc.collect()).toBe(0); // 都还在宽限期内
    const later = new Date(Date.now() + BLOB_GC_GRACE_MS + 60_000);
    expect(await gc.collect(later)).toBe(2);
    expect(await store.stat(alice.id, hash)).not.toBeNull();
    expect(await store.stat(alice.id, sha256(orphan))).toBeNull();
    // bob 名下同内容的 Blob 没被 alice 的附件「引用」
    expect(await store.stat(bob.id, hash)).toBeNull();
  });
});
