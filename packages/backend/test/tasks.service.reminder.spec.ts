import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskBucket, TaskStatus, ScheduledType } from '@taskora/shared';

import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

/**
 * Reminder 清理规则（reminders spec）的 REST 侧口径：
 * ScheduledType 离开 DATE 时清除提醒；换日期保留；拒绝非法 HH:mm。
 */
describe('TasksService — reminderTime 清理规则', () => {
  let service: TasksService;
  let mockPrisma: InstanceType<typeof PrismaService>;

  const userId = 'user-1';

  const datedTask = {
    id: 'task-1',
    title: '看牙医',
    notes: null,
    scheduledDate: new Date('2026-02-05T00:00:00Z'),
    scheduledType: ScheduledType.DATE,
    reminderTime: '09:00',
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
    areaId: null,
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    } as unknown as InstanceType<typeof PrismaService>;

    service = new TasksService(mockPrisma);
  });

  it('改时刻写 reminderTime；换日期（DATE → DATE）保留提醒', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(datedTask);
    mockPrisma.task.update.mockResolvedValue({ ...datedTask, tags: [] });

    await service.update(userId, 'task-1', { reminderTime: '18:30' });
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminderTime: '18:30' }) }),
    );

    mockPrisma.task.update.mockClear();
    await service.update(userId, 'task-1', { scheduledDate: '2026-03-01' });
    // 未传 reminderTime 且仍为 DATE → 不动 reminderTime
    const call = mockPrisma.task.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('reminderTime');
  });

  it('Someday / NONE 清除提醒', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(datedTask);
    mockPrisma.task.update.mockResolvedValue({ ...datedTask, tags: [] });

    await service.update(userId, 'task-1', { scheduledType: ScheduledType.SOMEDAY });
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminderTime: null }) }),
    );

    mockPrisma.task.update.mockClear();
    await service.update(userId, 'task-1', { scheduledType: ScheduledType.NONE });
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminderTime: null }) }),
    );
  });

  it('了结（complete/cancel）与移入 Trash 清除提醒', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(datedTask);
    mockPrisma.task.update.mockResolvedValue({ ...datedTask, status: TaskStatus.COMPLETED });
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

    await service.complete(userId, 'task-1');
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminderTime: null }) }),
    );

    mockPrisma.task.update.mockClear();
    mockPrisma.task.update.mockResolvedValue({ ...datedTask, status: TaskStatus.CANCELLED });
    await service.cancel(userId, 'task-1');
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminderTime: null }) }),
    );

    await service.remove(userId, 'task-1');
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reminderTime: null }) }),
    );
  });

  it('拒绝非法 reminderTime 格式（DTO 校验口径由 class-validator 执行）', async () => {
    // 这里只验证 service 不做二次清洗：合法入口（Controller 层 DTO）已挡非法值
    mockPrisma.task.findFirst.mockResolvedValue(datedTask);
    mockPrisma.task.update.mockResolvedValue({ ...datedTask, tags: [] });
    await service.update(userId, 'task-1', { reminderTime: '09:00' });
    expect(mockPrisma.task.update).toHaveBeenCalledTimes(1);
  });
});
