import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import { deriveRepeatInstanceId, deriveSubtaskId, type RepeatRule } from '@taskora/engine';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

/**
 * Repeating Tasks（recurring-tasks spec）REST 侧口径：
 * - Repeat Rule 写入归一化（规范形 JSON 文本）；离开 DATE 自动清除；
 * - complete 服务端派生下一实例（确定性 id 与设备侧一致，ADR-0012）；
 * - cancel 不派生；uncomplete/uncancel 撤销派生（删除实例）。
 */
describe('TasksService — Repeat Rule（recurring-tasks spec）', () => {
  let service: TasksService;
  let mockPrisma: Record<string, unknown>;

  const userId = 'user-1';

  const dailyRule: RepeatRule = { unit: 'day', interval: 1, anchor: 'scheduled' };
  const dailyRuleJson = JSON.stringify(dailyRule);

  const repeatingTask = {
    id: 'task-1',
    title: '浇花',
    notes: '客厅绿植',
    scheduledDate: new Date('2026-02-05T00:00:00Z'),
    scheduledType: ScheduledType.DATE,
    reminderTime: '09:00',
    repeatRule: dailyRuleJson,
    dueDate: null,
    bucket: TaskBucket.SCHEDULED,
    status: TaskStatus.ACTIVE,
    settledAt: null,
    trashedAt: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId,
    projectId: null,
    headingId: null,
    areaId: null,
  };

  const expectedInstanceId = deriveRepeatInstanceId('task-1', dailyRule, '2026-02-06');

  beforeEach(() => {
    mockPrisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ preferences: { timeZone: 'UTC' } }) },
      task: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
        aggregate: vi.fn(),
        delete: vi.fn(),
      },
      subtask: { create: vi.fn() },
      compactedEntity: { createMany: vi.fn(), findFirst: vi.fn() },
      $transaction: vi.fn(),
    };
    service = new TasksService(mockPrisma as unknown as PrismaService);
  });

  describe('update：清理与归一化', () => {
    it('设置规则归一化为规范形 JSON 文本落库；换日期（DATE → DATE）保留', async () => {
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(repeatingTask);
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        tags: [],
      });

      // 冗余 weekdays（day 单位）被归一化剥离
      await service.update(userId, 'task-1', {
        repeatRule: {
          unit: 'day',
          interval: 1,
          anchor: 'scheduled',
          weekdays: [1, 2],
        },
      });
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ repeatRule: dailyRuleJson }) }),
      );

      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockClear();
      await service.update(userId, 'task-1', { scheduledDate: '2026-03-05' });
      // 未传 repeatRule 且仍为 DATE → 不动规则
      const call = (mockPrisma.task.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.data).not.toHaveProperty('repeatRule');
    });

    it('Someday / NONE 清除规则；显式 null 清除', async () => {
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(repeatingTask);
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        tags: [],
      });

      await service.update(userId, 'task-1', { scheduledType: ScheduledType.SOMEDAY });
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ repeatRule: null }) }),
      );

      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockClear();
      await service.update(userId, 'task-1', { scheduledType: ScheduledType.NONE });
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ repeatRule: null }) }),
      );

      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockClear();
      await service.update(userId, 'task-1', { repeatRule: null });
      expect(mockPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ repeatRule: null }) }),
      );
    });

    it('响应 DTO 的 repeatRule 解析回对象', async () => {
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(repeatingTask);
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        tags: [],
      });

      const dto = await service.update(userId, 'task-1', { title: '改名' });
      expect(dto.repeatRule).toEqual(dailyRule);
    });
  });

  describe('complete：服务端派生（web 客户端路径）', () => {
    it('旧北京时间零点计划完成后派生明天，而非今天', async () => {
      (mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        preferences: { timeZone: 'Asia/Shanghai' },
      });
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ...repeatingTask,
          scheduledDate: new Date('2026-09-23T16:00Z'),
          tags: [],
          subtasks: [],
        })
        .mockResolvedValueOnce(null);
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue(repeatingTask);
      (mockPrisma.task.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _max: { sortOrder: 0 },
      });
      await service.complete(userId, 'task-1');
      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scheduledDate: new Date('2026-09-25T00:00Z') }),
        }),
      );
    });

    it('派生下一实例：确定性 id、复制集完整、子任务重置 ACTIVE', async () => {
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ...repeatingTask,
          tags: [{ tagId: 'tag-1' }],
          subtasks: [
            { id: 'st-1', title: '客厅', sortOrder: 0, status: TaskStatus.COMPLETED },
            { id: 'st-2', title: '阳台', sortOrder: 1, status: TaskStatus.ACTIVE },
          ],
        })
        .mockResolvedValueOnce(null); // 派生实例不存在 → 正常派生
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        status: TaskStatus.COMPLETED,
      });
      (mockPrisma.task.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
        _max: { sortOrder: 3 },
      });
      (mockPrisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (mockPrisma.subtask.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const dto = await service.complete(userId, 'task-1');
      expect(dto.status).toBe(TaskStatus.COMPLETED);
      expect(dto.repeatRule).toEqual(dailyRule); // 父任务保留规则作 Logbook 溯源

      expect(mockPrisma.task.create).toHaveBeenCalledTimes(1);
      const createCall = (mockPrisma.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(createCall.data.id).toBe(expectedInstanceId);
      expect(createCall.data.title).toBe('浇花');
      expect(createCall.data.notes).toBe('客厅绿植');
      expect(createCall.data.scheduledDate).toEqual(new Date('2026-02-06T00:00:00.000Z'));
      expect(createCall.data.scheduledType).toBe(ScheduledType.DATE);
      expect(createCall.data.reminderTime).toBe('09:00');
      expect(createCall.data.repeatRule).toBe(dailyRuleJson);
      expect(createCall.data.bucket).toBe(TaskBucket.SCHEDULED);
      expect(createCall.data.status).toBe(TaskStatus.ACTIVE);
      expect(createCall.data.sortOrder).toBe(4);
      expect(createCall.data.tags).toEqual({ create: [{ tagId: 'tag-1' }] });

      // 子任务派生：确定性 id + 重置 ACTIVE
      expect(mockPrisma.subtask.create).toHaveBeenCalledTimes(2);
      const [first, second] = (mockPrisma.subtask.create as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0].data)
        .map((data: { id: string; taskId: string }) => data);
      expect(first.id).toBe(deriveSubtaskId(expectedInstanceId, 0));
      expect(first.taskId).toBe(expectedInstanceId);
      expect(first.status).toBe(TaskStatus.ACTIVE);
      expect(second.id).toBe(deriveSubtaskId(expectedInstanceId, 1));
      expect(second.status).toBe(TaskStatus.ACTIVE);
    });

    it('幂等：目标 id 已存在（restore 后重完成）则跳过派生', async () => {
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        tags: [],
        subtasks: [],
      });
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        status: TaskStatus.COMPLETED,
      });
      // 第一次查父任务，第二次查派生实例（已存在）
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ...repeatingTask,
          tags: [],
          subtasks: [],
        })
        .mockResolvedValueOnce({ id: expectedInstanceId });

      await service.complete(userId, 'task-1');
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
      expect(mockPrisma.subtask.create).not.toHaveBeenCalled();
    });

    it('到达 until 链终结：不派生', async () => {
      const expired = {
        ...repeatingTask,
        repeatRule: JSON.stringify({
          unit: 'day',
          interval: 1,
          anchor: 'scheduled',
          until: '2026-02-05',
        }),
        tags: [],
        subtasks: [],
      };
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(expired);
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...expired,
        status: TaskStatus.COMPLETED,
      });

      await service.complete(userId, 'task-1');
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });

    it('无规则任务完成不派生', async () => {
      const plain = { ...repeatingTask, repeatRule: null, tags: [], subtasks: [] };
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(plain);
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...plain,
        status: TaskStatus.COMPLETED,
      });

      await service.complete(userId, 'task-1');
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });
  });

  it('重复完成（已 COMPLETED）不二次派生（anchor=completion 双击防护）', async () => {
    const completionAnchored = {
      ...repeatingTask,
      repeatRule: JSON.stringify({ unit: 'day', interval: 1, anchor: 'completion' }),
      status: TaskStatus.COMPLETED,
      tags: [],
      subtasks: [],
    };
    (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(completionAnchored);
    (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue(completionAnchored);

    await service.complete(userId, 'task-1');
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('确定性 id 已被 compact（uncomplete 删除后重新完成）→ 换新 uuid id 派生', async () => {
    (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...repeatingTask, tags: [{ tagId: 'tag-1' }], subtasks: [] })
      .mockResolvedValueOnce(null); // 派生实例不存在
    (mockPrisma.compactedEntity.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      entityId: expectedInstanceId, // compact 登记：确定性 id 已死
    });
    (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...repeatingTask,
      status: TaskStatus.COMPLETED,
    });
    (mockPrisma.task.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _max: { sortOrder: 0 },
    });
    (mockPrisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await service.complete(userId, 'task-1');
    const createCall = (mockPrisma.task.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.id).not.toBe(expectedInstanceId);
    expect(createCall.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  describe('cancel / uncomplete：派生副作用口径', () => {
    it('取消不派生（链终结，规则保留）', async () => {
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        tags: [],
        subtasks: [],
      });
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...repeatingTask,
        status: TaskStatus.CANCELLED,
      });

      const dto = await service.cancel(userId, 'task-1');
      expect(dto.repeatRule).toEqual(dailyRule);
      expect(mockPrisma.task.create).not.toHaveBeenCalled();
    });

    it('uncomplete 删除派生实例（Compact 登记 + 物理删除，级联 Subtask）', async () => {
      const settled = {
        ...repeatingTask,
        status: TaskStatus.COMPLETED,
        settledAt: new Date('2026-02-05T10:00:00Z'),
      };
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>).mockImplementation(async (args) => {
        const where = args?.where ?? {};
        if (where.id === 'task-1') return settled;
        return { id: expectedInstanceId, subtasks: [{ id: 'st-derived' }] };
      });
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...settled,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      });
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => fn(mockPrisma),
      );

      await service.uncomplete(userId, 'task-1');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // Compact 登记先于删除（task 与 subtask 各一次）
      expect(mockPrisma.compactedEntity.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ entity: 'task', entityId: expectedInstanceId })],
        }),
      );
      expect(mockPrisma.compactedEntity.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ entity: 'subtask', entityId: 'st-derived' })],
        }),
      );
      expect(mockPrisma.task.delete).toHaveBeenCalledWith({
        where: { id: expectedInstanceId },
      });
    });

    it('uncancel 对从未派生的任务无副作用（实例不存在则无操作）', async () => {
      const cancelled = {
        ...repeatingTask,
        status: TaskStatus.CANCELLED,
        settledAt: new Date('2026-02-05T10:00:00Z'),
      };
      (mockPrisma.task.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(cancelled)
        .mockResolvedValueOnce(null); // 派生实例不存在（纯取消从未派生）
      (mockPrisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...cancelled,
        status: TaskStatus.ACTIVE,
      });
      (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (fn: (tx: unknown) => Promise<void>) => fn(mockPrisma),
      );

      await service.uncancel(userId, 'task-1');
      expect(mockPrisma.task.delete).not.toHaveBeenCalled();
    });
  });
});
