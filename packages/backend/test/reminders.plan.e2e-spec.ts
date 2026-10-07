import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb, disconnectTestDb } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;

const e2eDescribe = hasTestDb ? describe : describe.skip;

/**
 * Android 后台同步（local-first-v3 issue 09）的完整链路：设备注册取回后台
 * 凭据 → 凭据读提醒计划；会话 JWT 不能读，轮换后旧凭据失效。
 */
e2eDescribe('GET /reminders/plan (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let jwt: string;
  let userId: string;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    await app.listen(0);

    prisma = moduleRef.get(PrismaService);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
    jwtService = moduleRef.get(JwtService);
  });

  beforeEach(async () => {
    await resetDb();
    const user = await prisma.user.create({
      data: {
        email: 'reminders-e2e@example.com',
        passwordHash: 'x',
        preferences: { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' },
      },
    });
    userId = user.id;
    jwt = jwtService.sign({ sub: userId });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
  });

  async function registerDevice(backgroundToken: boolean) {
    const response = await fetch(`${baseUrl}/sync/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'phone-1', label: 'mobile', backgroundToken }),
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { deviceId: string; backgroundToken?: string };
  }

  function getPlan(token: string) {
    return fetch(`${baseUrl}/reminders/plan`, { headers: { Authorization: `Bearer ${token}` } });
  }

  it('后台凭据读到按账号时区换算、带文案的完整计划', async () => {
    const project = await prisma.project.create({ data: { userId, title: '发布' } });
    await prisma.task.create({
      data: {
        id: 'task-1',
        userId,
        title: '写周报',
        notes: '汇总本周进展',
        scheduledType: 'DATE',
        scheduledDate: new Date('2099-01-05T00:00:00.000Z'),
        reminderTime: '09:00',
        projectId: project.id,
      },
    });
    const { backgroundToken } = await registerDevice(true);

    const response = await getPlan(backgroundToken!);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { reminders: unknown[]; cursor: number };
    expect(body.cursor).toEqual(expect.any(Number));
    expect(body.reminders).toEqual([
      {
        key: 'reminder:task-1',
        taskId: 'task-1',
        fireAt: Date.parse('2099-01-05T01:00:00.000Z'),
        snoozeTomorrowAt: Date.parse('2099-01-06T01:00:00.000Z'),
        title: '写周报',
        body: '09:00 · 发布\n汇总本周进展',
      },
    ]);
  });

  it('会话 JWT 读不了；不要求时不签发', async () => {
    expect((await getPlan(jwt)).status).toBe(401);
    expect((await registerDevice(false)).backgroundToken).toBeUndefined();
  });

  it('再次注册轮换凭据：旧凭据失效', async () => {
    const first = (await registerDevice(true)).backgroundToken!;
    const second = (await registerDevice(true)).backgroundToken!;
    expect(second).not.toBe(first);
    expect((await getPlan(first)).status).toBe(401);
    expect((await getPlan(second)).status).toBe(200);
  });
});
