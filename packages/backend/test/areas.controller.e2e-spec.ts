import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { resetDb, disconnectTestDb } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;

const e2eDescribe = hasTestDb ? describe : describe.skip;

e2eDescribe('AreasController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb();

    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: { email: 'test@example.com', passwordHash },
    });
    userId = user.id;
    authToken = jwtService.sign({ sub: userId });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
  });

  it('POST /areas → 201 create a new area', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Work', notes: 'Work area' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Work');
    expect(res.body.notes).toBe('Work area');
    expect(res.body.userId).toBe(userId);
    expect(res.body.tags).toEqual([]);
  });

  it('POST /areas with tagIds → 201 and returns tags', async () => {
    const tag = await prisma.tag.create({
      data: { title: 'Urgent', color: '#FF0000', userId },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/areas')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Work', tagIds: [tag.id] })
      .expect(201);

    expect(res.body.tags).toHaveLength(1);
    expect(res.body.tags[0].id).toBe(tag.id);
  });

  it('GET /areas → 200 return all areas for the user', async () => {
    await prisma.area.create({
      data: { title: 'Work', userId },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/areas')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Work');
    expect(res.body[0].tags).toEqual([]);
  });

  it('PATCH /areas/:id with tagIds → updates tags (full-set)', async () => {
    const area = await prisma.area.create({ data: { title: 'Work', userId } });
    const tag1 = await prisma.tag.create({ data: { title: 'T1', userId } });
    const tag2 = await prisma.tag.create({ data: { title: 'T2', userId } });

    // set tags
    const res1 = await request(app.getHttpServer())
      .patch(`/api/v1/areas/${area.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tagIds: [tag1.id, tag2.id] })
      .expect(200);
    expect(res1.body.tags).toHaveLength(2);

    // replace with a subset
    const res2 = await request(app.getHttpServer())
      .patch(`/api/v1/areas/${area.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tagIds: [tag1.id] })
      .expect(200);
    expect(res2.body.tags).toHaveLength(1);
    expect(res2.body.tags[0].id).toBe(tag1.id);

    // clear tags
    const res3 = await request(app.getHttpServer())
      .patch(`/api/v1/areas/${area.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tagIds: [] })
      .expect(200);
    expect(res3.body.tags).toEqual([]);
  });

  it('GET /areas/:id → 404 for a non-existent area', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/areas/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });
});

if (!hasTestDb) {
  console.warn(
    '[AreasController e2e] Skipped — set TEST_DATABASE_URL to enable.\n' +
      'Example: TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/taskora_test" pnpm --filter @taskora/backend test',
  );
}