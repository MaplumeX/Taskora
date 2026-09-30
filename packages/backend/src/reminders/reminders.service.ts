import { Injectable } from '@nestjs/common';

import { planReminderDeliveries, type ReminderTaskInput } from '@taskora/engine';
import { ScheduledType, TaskStatus } from '@taskora/shared';

import { PrismaService } from '../prisma/prisma.service';
import { SyncChangeLog } from '../sync/sync-change-log';
import { userCalendarZones } from '../users/account-time-zone';

/**
 * 提醒计划（local-first-v3 issue 09）：与设备上的 Reminder 协调器同一套
 * 规则（@taskora/engine 的 planReminderDeliveries），按 Postgres 计算。
 * Android 原生的后台同步取回它直接交给闹钟，不经 JS、不写副本。
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: SyncChangeLog,
  ) {}

  async plan(userId: string, now = new Date()) {
    // 先读 cursor 再读任务：计划至少包含到 cursor 为止的变更。设备副本
    // 拉到这个位置后，它自己算的计划就不比这份旧（原生据此交还控制权）。
    const cursor = await this.log.currentSeq(userId);
    const [zones, rows] = await Promise.all([
      userCalendarZones(this.prisma, userId),
      this.prisma.task.findMany({
        // 粗筛；最终以 domain 的 isReminderEligible 为准
        where: {
          userId,
          reminderTime: { not: null },
          scheduledType: ScheduledType.DATE,
          status: TaskStatus.ACTIVE,
          trashedAt: null,
        },
        select: {
          id: true,
          title: true,
          notes: true,
          scheduledType: true,
          scheduledDate: true,
          reminderTime: true,
          status: true,
          trashedAt: true,
          projectId: true,
          areaId: true,
          project: { select: { title: true } },
          area: { select: { title: true } },
        },
      }),
    ]);

    const tasks: ReminderTaskInput[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      scheduledType: row.scheduledType as ScheduledType,
      scheduledDate: row.scheduledDate?.toISOString() ?? null,
      reminderTime: row.reminderTime,
      status: row.status as TaskStatus,
      trashedAt: row.trashedAt?.toISOString() ?? null,
      projectId: row.projectId,
      areaId: row.areaId,
    }));
    const titles = { projects: new Map<string, string>(), areas: new Map<string, string>() };
    for (const row of rows) {
      if (row.projectId && row.project) titles.projects.set(row.projectId, row.project.title);
      if (row.areaId && row.area) titles.areas.set(row.areaId, row.area.title);
    }

    return { reminders: planReminderDeliveries(tasks, now, zones, titles), cursor };
  }
}
