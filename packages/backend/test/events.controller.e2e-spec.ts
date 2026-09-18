import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { EventStreamFrame } from '@taskora/shared';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb, disconnectTestDb } from './db';

const hasTestDb = !!process.env.TEST_DATABASE_URL;

const e2eDescribe = hasTestDb ? describe : describe.skip;

/**
 * GET /events (SSE) e2e: auth rejection, hello frame, live change events
 * after API writes, reconnect replay via ?since=, and resync when the gap
 * cannot be replayed.
 */
e2eDescribe('EventsController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;
  let authToken: string;
  let userId: string;
  let baseUrl: string;

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
    await app.listen(0);

    jwtService = moduleRef.get(JwtService);
    prisma = moduleRef.get(PrismaService);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
  });

  beforeEach(async () => {
    await resetDb();

    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: { email: 'events-e2e@example.com', passwordHash },
    });
    userId = user.id;
    authToken = jwtService.sign({ sub: userId });
  });

  afterAll(async () => {
    await app?.close();
    await disconnectTestDb();
  });

  /** Open the event stream; returns the parsed frames as they arrive. */
  function openStream(since?: number): {
    frames: EventStreamFrame[];
    close: () => Promise<void>;
    next: (
      predicate: (frame: EventStreamFrame) => boolean,
      timeoutMs?: number,
    ) => Promise<EventStreamFrame>;
  } {
    const controller = new AbortController();
    const frames: EventStreamFrame[] = [];
    const waiters: {
      predicate: (f: EventStreamFrame) => boolean;
      resolve: (f: EventStreamFrame) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }[] = [];

    const pump = async () => {
      const url = since !== undefined ? `${baseUrl}/events?since=${since}` : `${baseUrl}/events`;
      const response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${authToken}`,
        },
        signal: controller.signal,
      });
      if (response.status !== 200 || !response.body) {
        throw new Error(`stream failed: HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of frame.split('\n')) {
            if (line.startsWith('data:')) {
              const parsed = JSON.parse(line.slice(5).trim()) as EventStreamFrame;
              frames.push(parsed);
              for (let i = waiters.length - 1; i >= 0; i -= 1) {
                if (waiters[i].predicate(parsed)) {
                  clearTimeout(waiters[i].timer);
                  waiters[i].resolve(parsed);
                  waiters.splice(i, 1);
                }
              }
            }
          }
        }
      }
    };

    const pumpPromise = pump().catch(() => undefined); // aborts surface here

    return {
      frames,
      close: async () => {
        controller.abort();
        await pumpPromise;
      },
      next: (predicate, timeoutMs = 3000) =>
        new Promise<EventStreamFrame>((resolve, reject) => {
          const existing = frames.find(predicate);
          if (existing) {
            resolve(existing);
            return;
          }
          const timer = setTimeout(
            () => reject(new Error('timed out waiting for frame')),
            timeoutMs,
          );
          waiters.push({ predicate, resolve, reject, timer });
        }),
    };
  }

  const createTask = async (title: string) => {
    const res = await fetch(`${baseUrl}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ title }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string };
  };

  it('rejects unauthenticated connections', async () => {
    const res = await fetch(`${baseUrl}/events`, { headers: { Accept: 'text/event-stream' } });
    expect(res.status).toBe(401);
  });

  it('sends a hello frame with the current seq on connect', async () => {
    const stream = openStream();
    const hello = await stream.next((f) => f.type === 'hello');
    expect(hello.type).toBe('hello');
    if (hello.type === 'hello') {
      expect(hello.seq).toBeGreaterThan(0);
    }
    await stream.close();
  });

  it('streams change events for API writes', async () => {
    const stream = openStream();
    await stream.next((f) => f.type === 'hello');

    const task = await createTask('Live one');
    const frame = await stream.next(
      (f) => f.type === 'change' && f.event.entity === 'task' && f.event.id === task.id,
    );
    expect(frame.type).toBe('change');
    if (frame.type === 'change') {
      expect(frame.event.action).toBe('created');
      expect(frame.event.data?.title).toBe('Live one');
      expect(frame.event.seq).toBeGreaterThan(0);
    }
    await stream.close();
  });

  it('replays missed events on reconnect with ?since=', async () => {
    const first = openStream();
    await first.next((f) => f.type === 'hello');
    const missedTask = await createTask('Missed');
    const missedFrame = await first.next(
      (f) => f.type === 'change' && f.event.id === missedTask.id,
    );
    await first.close();

    // While disconnected, another write happens.
    const other = await createTask('While away');

    // Reconnect from the last seen seq.
    if (missedFrame.type !== 'change') throw new Error('expected change frame');
    const second = openStream(missedFrame.event.seq);
    const replayed = await second.next((f) => f.type === 'change' && f.event.id === other.id);
    expect(replayed.type).toBe('change');
    if (replayed.type === 'change') {
      expect(replayed.event.action).toBe('created');
      // Replay preserves the original seq order.
      expect(replayed.event.seq).toBeGreaterThan(missedFrame.event.seq);
    }

    // Live events keep flowing after the replay.
    const liveTask = await createTask('After reconnect');
    const live = await second.next((f) => f.type === 'change' && f.event.id === liveTask.id);
    expect(live.type).toBe('change');
    await second.close();
  });

  it('signals resync when the client holds a seq from before a restart', async () => {
    const stream = openStream();
    const hello = await stream.next((f) => f.type === 'hello');
    await stream.close();
    if (hello.type !== 'hello') throw new Error('expected hello');

    // A seq far beyond the hub's state cannot be replayed.
    const second = openStream(hello.seq + 5_000_000);
    const resync = await second.next((f) => f.type === 'resync');
    expect(resync.type).toBe('resync');
    await second.close();
  });
});
