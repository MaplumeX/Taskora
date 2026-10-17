import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { deriveSubtaskId } from '@taskora/engine';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb, disconnectTestDb } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;

const e2eDescribe = hasTestDb ? describe : describe.skip;

/** 账号时区 Asia/Shanghai：2026-02-05 09:00 的提醒时刻。 */
const FIRE_AT = Date.parse('2026-02-05T01:00:00.000Z');
/** 点击时刻 09:02:30（上海）。 */
const TAPPED_AT = Date.parse('2026-02-05T01:02:30.000Z');
const DRAFT_ID = '7d2f5f0e-6a43-4b8e-9a52-1c4d0f9e2b11';

/**
 * App 外写入直达 hub（android-out-of-app-writes issue 02）：设备后台凭据
 * 送达通知操作与快速添加，按共用规则应用、记入变更日志，重复送达不重复生效。
 */
e2eDescribe('App 外写入 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let jwt: string;
  let userId: string;
  let baseUrl: string;
  let token: string;

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
        email: 'out-of-app-e2e@example.com',
        passwordHash: 'x',
        preferences: { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' },
      },
    });
    userId = user.id;
    jwt = jwtService.sign({ sub: userId });
    const response = await fetch(`${baseUrl}/sync/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'phone-1', label: 'mobile', backgroundToken: true }),
    });
    token = ((await response.json()) as { backgroundToken: string }).backgroundToken;
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
  });

  function post(path: string, body: unknown, bearer = token) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function action(kind: string, firedFireAt = FIRE_AT) {
    return post('/reminders/actions', {
      taskId: 'task-1',
      action: kind,
      firedFireAt,
      tappedAt: TAPPED_AT,
    });
  }

  async function seedReminderTask(extra: Record<string, unknown> = {}) {
    await prisma.task.create({
      data: {
        id: 'task-1',
        userId,
        title: '交周报',
        start: 'ANYTIME',
        scheduledDate: new Date('2026-02-05T00:00:00.000Z'),
        reminderTime: '09:00',
        ...extra,
      },
    });
  }

  const changeCount = () => prisma.syncChange.count({ where: { userId } });

  describe('POST /reminders/actions', () => {
    it('完成：了结时间为点击时刻，写入变更日志', async () => {
      await seedReminderTask();
      const before = await changeCount();

      const response = await action('complete');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: 'applied' });

      const row = await prisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
      expect(row.status).toBe('COMPLETED');
      expect(row.settledAt?.getTime()).toBe(TAPPED_AT);
      expect(row.reminderTime).toBeNull();
      expect(await changeCount()).toBeGreaterThan(before);
    });

    it('重复任务：派生下一实例；重复送达被丢弃，不二次派生', async () => {
      await seedReminderTask({
        repeatRule: JSON.stringify({ unit: 'day', interval: 1, anchor: 'scheduled' }),
      });

      expect(await (await action('complete')).json()).toEqual({ result: 'applied' });
      expect(await (await action('complete')).json()).toEqual({
        result: 'discarded',
        reason: 'ineligible',
      });
      expect(await prisma.task.count({ where: { repeatSourceId: 'task-1' } })).toBe(1);
    });

    it('Snooze 15 分钟：按账号时区改写计划日期与提醒时刻；重复送达因快照过期丢弃', async () => {
      await seedReminderTask();

      expect(await (await action('snooze15')).json()).toEqual({ result: 'applied' });
      const row = await prisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
      expect(row.reminderTime).toBe('09:18');
      expect(row.scheduledDate?.toISOString()).toBe('2026-02-05T00:00:00.000Z');

      expect(await (await action('snooze15')).json()).toEqual({
        result: 'discarded',
        reason: 'stale',
      });
      const again = await prisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
      expect(again.reminderTime).toBe('09:18');
    });

    it('Snooze 到明天：计划日期为点击日 + 1，提醒时刻不变', async () => {
      await seedReminderTask();
      await action('snoozeTomorrow');
      const row = await prisma.task.findUniqueOrThrow({ where: { id: 'task-1' } });
      expect(row.scheduledDate?.toISOString()).toBe('2026-02-06T00:00:00.000Z');
      expect(row.reminderTime).toBe('09:00');
    });

    it('别处已改提醒（快照不一致）或任务不存在：丢弃，不改动', async () => {
      await seedReminderTask();
      expect(await (await action('complete', FIRE_AT - 60_000)).json()).toEqual({
        result: 'discarded',
        reason: 'stale',
      });
      expect((await prisma.task.findUniqueOrThrow({ where: { id: 'task-1' } })).status).toBe(
        'ACTIVE',
      );

      await prisma.task.delete({ where: { id: 'task-1' } });
      expect(await (await action('complete')).json()).toEqual({
        result: 'discarded',
        reason: 'missing',
      });
    });

    it('非法动作 400', async () => {
      await seedReminderTask();
      expect((await action('archive')).status).toBe(400);
    });
  });

  describe('POST /quick-add', () => {
    it('按设备给的 id 建任务：归属、Tag、Reminder、Subtask 同时写入', async () => {
      const project = await prisma.project.create({ data: { userId, title: '工作' } });
      const tag = await prisma.tag.create({ data: { userId, title: '急' } });
      const before = await changeCount();

      const response = await post('/quick-add', {
        id: DRAFT_ID,
        draft: {
          title: ' 周报 ',
          when: { type: 'date', date: '2026-02-06' },
          reminderTime: '10:30',
          projectId: project.id,
          tagIds: [tag.id, 'gone'],
          subtasks: ['整理', '发送'],
        },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ taskId: DRAFT_ID });

      const row = await prisma.task.findUniqueOrThrow({
        where: { id: DRAFT_ID },
        include: { tags: true, subtasks: true },
      });
      expect(row).toMatchObject({
        userId,
        title: '周报',
        projectId: project.id,
        reminderTime: '10:30',
        start: 'ANYTIME',
      });
      expect(row.scheduledDate?.toISOString()).toBe('2026-02-06T00:00:00.000Z');
      expect(row.tags.map((t) => t.tagId)).toEqual([tag.id]);
      const subtasks = [...row.subtasks].sort((a, b) => (a.position < b.position ? -1 : 1));
      expect(subtasks.map((s) => [s.id, s.title])).toEqual([
        [deriveSubtaskId(DRAFT_ID, 0), '整理'],
        [deriveSubtaskId(DRAFT_ID, 1), '发送'],
      ]);
      expect(await changeCount()).toBeGreaterThan(before);
    });

    it('原生送来的草稿带着提交属性（id / openInApp）：照常接受', async () => {
      const response = await post('/quick-add', {
        id: DRAFT_ID,
        draft: { id: DRAFT_ID, openInApp: false, title: '买牛奶' },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ taskId: DRAFT_ID });
    });

    it('重复送达：返回同一任务，不重复创建', async () => {
      const body = { id: DRAFT_ID, draft: { title: '买牛奶', subtasks: ['全脂'] } };
      await post('/quick-add', body);
      const changes = await changeCount();

      const again = await post('/quick-add', body);
      expect(await again.json()).toEqual({ taskId: DRAFT_ID });
      expect(await prisma.task.count({ where: { userId } })).toBe(1);
      expect(await prisma.subtask.count()).toBe(1);
      expect(await changeCount()).toBe(changes);
    });

    it('已被删除（Compact）的 id：不重建', async () => {
      await prisma.compactedEntity.create({
        data: { userId, entity: 'task', entityId: DRAFT_ID },
      });
      const response = await post('/quick-add', { id: DRAFT_ID, draft: { title: '旧草稿' } });
      expect(await response.json()).toEqual({ taskId: null });
      expect(await prisma.task.count()).toBe(0);
    });

    it('引用已进 Trash 的项目：回落 Inbox', async () => {
      const project = await prisma.project.create({
        data: { userId, title: '旧项目', trashedAt: new Date() },
      });
      await post('/quick-add', { id: DRAFT_ID, draft: { title: 'x', projectId: project.id } });
      const row = await prisma.task.findUniqueOrThrow({ where: { id: DRAFT_ID } });
      expect(row.projectId).toBeNull();
      expect(row.start).toBe('INBOX');
    });

    it('空标题不落库；草稿不是对象或 id 不是 UUID 时 400', async () => {
      expect(
        await (await post('/quick-add', { id: DRAFT_ID, draft: { title: ' ' } })).json(),
      ).toEqual({ taskId: null });
      expect((await post('/quick-add', { id: DRAFT_ID, draft: { notes: 'x' } })).status).toBe(400);
      expect((await post('/quick-add', { id: 'nope', draft: { title: 'x' } })).status).toBe(400);
    });
  });

  describe('凭据', () => {
    it('会话 JWT 不能调用这两个接口', async () => {
      await seedReminderTask();
      expect((await action('complete', FIRE_AT)).status).toBe(200);
      expect(
        (
          await post(
            '/reminders/actions',
            { taskId: 'task-1', action: 'complete', firedFireAt: FIRE_AT, tappedAt: TAPPED_AT },
            jwt,
          )
        ).status,
      ).toBe(401);
      expect((await post('/quick-add', { id: DRAFT_ID, draft: { title: 'x' } }, jwt)).status).toBe(
        401,
      );
    });

    it('后台凭据不能调用其他写接口', async () => {
      expect((await post('/tasks', { title: '越权' })).status).toBe(401);
      expect(await prisma.task.count()).toBe(0);
    });
  });
});
