import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/prisma/prisma.service';
import { BackgroundTokenGuard } from '../src/reminders/background-token.guard';
import { hashBackgroundToken } from '../src/reminders/background-token';
import { RemindersService } from '../src/reminders/reminders.service';
import { InMemorySyncChangeLog } from '../src/sync/in-memory-sync-change-log';
import { SyncHubService } from '../src/sync/sync-hub.service';

const USER = 'user-1';
const SHANGHAI = { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' };

function contextWith(headers: Record<string, string>) {
  const req: { headers: Record<string, string>; user?: { id: string } } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
}

describe('后台凭据（local-first-v3 issue 09）', () => {
  let upsert: ReturnType<typeof vi.fn>;
  let findUnique: ReturnType<typeof vi.fn>;
  let prisma: PrismaService;

  beforeEach(() => {
    upsert = vi.fn().mockResolvedValue(null);
    findUnique = vi.fn().mockResolvedValue(null);
    prisma = { device: { upsert, findUnique } } as unknown as PrismaService;
  });

  it('设备注册按需签发：库里只存哈希，明文只在响应里', async () => {
    const hub = new SyncHubService(prisma, new InMemorySyncChangeLog());
    const result = await hub.registerDevice(USER, 'dev-1', 'mobile', true);

    expect(result.backgroundToken).toEqual(expect.any(String));
    const { create, update } = upsert.mock.calls[0][0];
    expect(create.backgroundTokenHash).toBe(hashBackgroundToken(result.backgroundToken!));
    expect(update.backgroundTokenHash).toBe(create.backgroundTokenHash);
    expect(update.backgroundTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('不要求时不签发，也不动已有凭据（桌面注册）', async () => {
    const hub = new SyncHubService(prisma, new InMemorySyncChangeLog());
    expect(await hub.registerDevice(USER, 'dev-1', 'desktop')).toEqual({ deviceId: 'dev-1' });
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('backgroundTokenHash');
  });

  it('守卫：有效凭据放行并以设备所属用户为 req.user', async () => {
    findUnique.mockResolvedValue({
      userId: USER,
      backgroundTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    const { req, context } = contextWith({ authorization: 'Bearer secret' });

    await expect(new BackgroundTokenGuard(prisma).canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ id: USER });
    expect(findUnique.mock.calls[0][0].where).toEqual({
      backgroundTokenHash: hashBackgroundToken('secret'),
    });
  });

  it('守卫：缺失、未知或过期的凭据一律 401', async () => {
    const guard = new BackgroundTokenGuard(prisma);
    await expect(guard.canActivate(contextWith({}).context)).rejects.toThrow(UnauthorizedException);
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer unknown' }).context),
    ).rejects.toThrow(UnauthorizedException);

    findUnique.mockResolvedValue({
      userId: USER,
      backgroundTokenExpiresAt: new Date(Date.now() - 1),
    });
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer expired' }).context),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('RemindersService.plan — hub 按共享规则计算完整提醒计划', () => {
  const NOW = new Date('2026-02-04T12:00:00.000Z');

  function taskRow(partial: Record<string, unknown>) {
    return {
      title: '任务',
      notes: null,
      scheduledType: 'DATE',
      // Postgres 存 UTC 零点的 DateTime
      scheduledDate: new Date('2026-02-05T00:00:00.000Z'),
      reminderTime: '09:00',
      status: 'ACTIVE',
      trashedAt: null,
      projectId: null,
      areaId: null,
      project: null,
      area: null,
      ...partial,
    };
  }

  it('账户时区换算触发时刻，附文案，返回计算前的 cursor', async () => {
    const findMany = vi.fn().mockResolvedValue([
      taskRow({
        id: 't1',
        title: '写周报',
        notes: '汇总本周进展\n第二行',
        projectId: 'p1',
        project: { title: '发布' },
        areaId: 'a1',
        area: { title: '工作' },
      }),
      taskRow({
        id: 't2',
        title: '复盘',
        reminderTime: '10:15',
        areaId: 'a1',
        area: { title: '工作' },
      }),
      // 已过去的提醒不产出
      taskRow({ id: 't3', scheduledDate: new Date('2026-02-04T00:00:00.000Z') }),
    ]);
    const prisma = {
      task: { findMany },
      user: { findUnique: vi.fn().mockResolvedValue({ preferences: SHANGHAI }) },
    } as unknown as PrismaService;
    const log = new InMemorySyncChangeLog();
    vi.spyOn(log, 'currentSeq').mockResolvedValue(42);

    const plan = await new RemindersService(prisma, log).plan(USER, NOW);

    expect(plan).toEqual({
      cursor: 42,
      reminders: [
        {
          key: 'reminder:t1',
          taskId: 't1',
          fireAt: Date.parse('2026-02-05T01:00:00.000Z'),
          snoozeTomorrowAt: Date.parse('2026-02-06T01:00:00.000Z'),
          title: '写周报',
          body: '09:00 · 发布\n汇总本周进展',
        },
        {
          key: 'reminder:t2',
          taskId: 't2',
          fireAt: Date.parse('2026-02-05T02:15:00.000Z'),
          snoozeTomorrowAt: Date.parse('2026-02-06T02:15:00.000Z'),
          title: '复盘',
          body: '10:15 · 工作',
        },
      ],
    });
    // 粗筛只取可能产出提醒的行
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      userId: USER,
      reminderTime: { not: null },
      scheduledType: 'DATE',
      status: 'ACTIVE',
      trashedAt: null,
    });
  });
});
