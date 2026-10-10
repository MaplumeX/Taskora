import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CalendarEventDto, CalendarSubscriptionDto } from '@taskora/shared';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { disconnectTestDb, resetDb } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;
const e2eDescribe = hasTestDb ? describe : describe.skip;

const WORK = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:工作',
  'BEGIN:VEVENT',
  'UID:standup',
  'DTSTART:20261012T010000Z',
  'DTEND:20261012T013000Z',
  'RRULE:FREQ=DAILY;COUNT=3',
  'SUMMARY:站会',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:offsite',
  'DTSTART;VALUE=DATE:20261013',
  'DTEND;VALUE=DATE:20261014',
  'SUMMARY:团建',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

/** 日历订阅（ADR 0023）：添加时拉取校验、按账号时区查询日程、停用 / 删除。 */
e2eDescribe('calendar subscriptions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let jwt: string;
  let baseUrl: string;
  let source: Server;
  let sourceUrl: string;
  let sourceBody = WORK;
  let sourceHits = 0;
  const previousAllow = process.env.CALENDAR_ALLOW_PRIVATE_NETWORK;

  beforeAll(async () => {
    process.env.CALENDAR_ALLOW_PRIVATE_NETWORK = 'true';
    source = createServer((req, res) => {
      sourceHits += 1;
      if (req.url === '/work.ics') {
        res.writeHead(200, { 'Content-Type': 'text/calendar' });
        res.end(sourceBody);
      } else if (req.url === '/page.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => source.listen(0, '127.0.0.1', resolve));
    sourceUrl = `http://127.0.0.1:${(source.address() as AddressInfo).port}`;

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
    jwtService = moduleRef.get(JwtService);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  beforeEach(async () => {
    await resetDb();
    sourceBody = WORK;
    const user = await prisma.user.create({
      data: {
        email: 'calendar-e2e@example.com',
        passwordHash: 'x',
        preferences: { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' },
      },
    });
    jwt = jwtService.sign({ sub: user.id });
  });

  afterAll(async () => {
    if (previousAllow === undefined) delete process.env.CALENDAR_ALLOW_PRIVATE_NETWORK;
    else process.env.CALENDAR_ALLOW_PRIVATE_NETWORK = previousAllow;
    await app?.close();
    await new Promise<void>((resolve) => source.close(() => resolve()));
    await disconnectTestDb();
  });

  async function call(method: string, path: string, body?: unknown, token = jwt) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }

  it('adds a subscription named after the calendar and lists its events', async () => {
    const created = await call('POST', '/calendar/subscriptions', {
      url: `${sourceUrl}/work.ics`,
    });
    expect(created.status).toBe(201);
    const subscription = created.body as CalendarSubscriptionDto;
    expect(subscription).toMatchObject({
      name: '工作',
      color: 'blue',
      enabled: true,
      lastError: null,
    });

    const second = await call('POST', '/calendar/subscriptions', {
      url: `${sourceUrl}/work.ics`,
      name: '副本',
    });
    expect((second.body as CalendarSubscriptionDto).color).toBe('green');

    const list = await call('GET', '/calendar/subscriptions');
    expect((list.body as CalendarSubscriptionDto[]).map((s) => s.name)).toEqual(['工作', '副本']);

    await call('DELETE', `/calendar/subscriptions/${(second.body as CalendarSubscriptionDto).id}`);
    const events = await call('GET', '/calendar/events?from=2026-10-12&to=2026-10-13');
    expect(events.status).toBe(200);
    expect(
      (events.body as CalendarEventDto[]).map((e) => [e.title, e.allDay, e.start, e.color]),
    ).toEqual([
      ['站会', false, '2026-10-12T01:00:00.000Z', 'blue'],
      ['团建', true, '2026-10-13', 'blue'],
      ['站会', false, '2026-10-13T01:00:00.000Z', 'blue'],
    ]);
  });

  it('rejects links that do not serve a calendar', async () => {
    const notIcs = await call('POST', '/calendar/subscriptions', { url: `${sourceUrl}/page.html` });
    expect(notIcs).toMatchObject({ status: 422, body: { message: 'not_ics' } });
    const missing = await call('POST', '/calendar/subscriptions', { url: `${sourceUrl}/nope.ics` });
    expect(missing).toMatchObject({ status: 422, body: { message: 'http_error:404' } });
    const badScheme = await call('POST', '/calendar/subscriptions', { url: 'file:///etc/passwd' });
    expect(badScheme).toMatchObject({ status: 400, body: { message: 'invalid_url' } });
    expect((await call('GET', '/calendar/subscriptions')).body).toEqual([]);
  });

  it('hides disabled subscriptions and serves events from cache', async () => {
    const created = (
      await call('POST', '/calendar/subscriptions', { url: `${sourceUrl}/work.ics` })
    ).body as CalendarSubscriptionDto;
    const hits = sourceHits;
    await call('GET', '/calendar/events?from=2026-10-12&to=2026-10-12');
    expect(sourceHits).toBe(hits);

    const updated = await call('PATCH', `/calendar/subscriptions/${created.id}`, {
      enabled: false,
      color: 'red',
    });
    expect(updated.body).toMatchObject({ enabled: false, color: 'red' });
    const events = await call('GET', '/calendar/events?from=2026-10-12&to=2026-10-12');
    expect(events.body).toEqual([]);
  });

  it('validates the range and ownership', async () => {
    expect((await call('GET', '/calendar/events?from=2026-10-12&to=2026-10-11')).status).toBe(400);
    expect((await call('GET', '/calendar/events?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    expect((await call('GET', '/calendar/events?from=bad&to=2026-10-11')).status).toBe(400);

    const created = (
      await call('POST', '/calendar/subscriptions', { url: `${sourceUrl}/work.ics` })
    ).body as CalendarSubscriptionDto;
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const otherJwt = jwtService.sign({ sub: other.id });
    expect(
      (await call('DELETE', `/calendar/subscriptions/${created.id}`, undefined, otherJwt)).status,
    ).toBe(404);
    expect(
      (await call('GET', '/calendar/events?from=2026-10-12&to=2026-10-12', undefined, otherJwt))
        .body,
    ).toEqual([]);
  });
});
