import { describe, expect, it, vi } from 'vitest';
import { validate } from 'class-validator';
import { AuthService } from '../src/auth/auth.service';
import { UpdatePreferencesDto } from '../src/users/dto/users.dto';
import { matchesCalendarView } from '../src/users/account-time-zone';
import { renderSystemPrompt } from '../src/agent/runtime/agent-model';

describe('Account time zone', () => {
  it('REST Today/Upcoming 与助手当前日期一致，覆盖 UTC 午夜前的北京时间', () => {
    const now = new Date('2026-09-23T17:00Z');
    expect(matchesCalendarView(new Date('2026-09-24T00:00Z'), 'today', 'Asia/Shanghai', now)).toBe(
      true,
    );
    expect(matchesCalendarView(new Date('2026-09-23T16:00Z'), 'today', 'Asia/Shanghai', now)).toBe(
      true,
    );
    expect(
      matchesCalendarView(new Date('2026-09-24T00:00Z'), 'upcoming', 'America/Los_Angeles', now),
    ).toBe(true);
    expect(renderSystemPrompt(now, 'Asia/Shanghai')).toContain('2026-09-24 (Asia/Shanghai)');
  });

  it('偏好校验接受 IANA 时区、拒绝无效值', async () => {
    expect(
      await validate(Object.assign(new UpdatePreferencesDto(), { timeZone: 'Asia/Shanghai' })),
    ).toHaveLength(0);
    expect(
      await validate(Object.assign(new UpdatePreferencesDto(), { timeZone: 'Not/A_Zone' })),
    ).not.toHaveLength(0);
    expect(
      await validate(Object.assign(new UpdatePreferencesDto(), { timeZone: null })),
    ).not.toHaveLength(0);
  });

  it('首次设备时区初始化是条件原子写，不覆盖已有账号时区', async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const user = { id: 'u', preferences: { timeZone: 'Asia/Shanghai' } };
    const prisma = {
      $transaction: vi.fn((callback) => callback({ $executeRaw: execute })),
      user: { findUnique: vi.fn().mockResolvedValue(user) },
    };
    const service = new AuthService(prisma as never, {} as never);
    expect(await service.getMe('u', 'America/New_York')).toEqual(user);
    expect(execute.mock.calls[0][0].join('')).toContain("(preferences->>'timeZone') IS NULL");
    expect(execute.mock.calls[0].slice(1)).toEqual(['America/New_York', 'America/New_York', 'u']);
    execute.mockClear();
    await service.getMe('u', 'Not/A_Zone');
    expect(execute).not.toHaveBeenCalled();
  });
});
