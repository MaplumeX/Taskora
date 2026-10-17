import { BadRequestException, Injectable } from '@nestjs/common';

import { resolveReminderAction, type ReminderActionRequest } from '@taskora/engine';
import { planQuickAddTask, toQuickAddDraft, type QuickAddReferences } from '@taskora/shared';

import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_TASK_SELECT, reminderInputFromRow } from '../reminders/reminders.service';
import { TasksService } from '../tasks/tasks.service';
import { userCalendarZones } from '../users/account-time-zone';

/**
 * App 外写入直达 hub（android-out-of-app-writes）：App 未运行时，Android
 * 原生用设备后台凭据把通知操作与状态栏快速添加直接交给 hub。规则与设备
 * 上同一份（Reminder Action、planQuickAddTask），写入走 TasksService 的
 * 既有路径，经 Sync Hub 记入变更日志，其他设备照常 pull。
 *
 * 重复送达（Worker 重试、响应丢失）不会重复生效：完成过的任务被判为不
 * 再适用、Snooze 过的通知快照已过期，都会丢弃；快速添加按设备生成的 id 去重。
 */
@Injectable()
export class OutOfAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  async applyReminderAction(userId: string, request: ReminderActionRequest) {
    const [row, zones] = await Promise.all([
      this.prisma.task.findFirst({
        where: { id: request.taskId, userId },
        select: REMINDER_TASK_SELECT,
      }),
      userCalendarZones(this.prisma, userId),
    ]);
    const resolution = resolveReminderAction(
      row ? reminderInputFromRow(row) : null,
      request,
      zones.timeZone,
      zones.legacyDateTimeZone,
    );
    if (resolution.kind === 'complete') {
      await this.tasks.complete(userId, request.taskId, resolution.settledAt);
    } else if (resolution.kind === 'snooze') {
      await this.tasks.update(userId, request.taskId, {
        scheduledDate: resolution.scheduledDate,
        reminderTime: resolution.reminderTime,
      });
    }
    return resolution.kind === 'discard'
      ? { result: 'discarded' as const, reason: resolution.reason }
      : { result: 'applied' as const };
  }

  /** 草稿标题为空时不落库，返回 taskId null（与设备上同口径）。 */
  async quickAdd(userId: string, id: string, input: unknown) {
    const draft = toQuickAddDraft(input);
    if (!draft) throw new BadRequestException('Invalid quick add draft');

    // 只查草稿用到的引用；已进 Trash 的项目不收任务
    const refs: QuickAddReferences = {};
    if (draft.projectId) {
      refs.project = await this.prisma.project.findFirst({
        where: { id: draft.projectId, userId, trashedAt: null },
        select: { id: true, title: true, status: true },
      });
    } else if (draft.areaId) {
      refs.area = await this.prisma.area.findFirst({
        where: { id: draft.areaId, userId },
        select: { id: true, title: true },
      });
    }
    if (draft.tagIds?.length) {
      const tags = await this.prisma.tag.findMany({
        where: { id: { in: draft.tagIds }, userId },
        select: { id: true },
      });
      refs.knownTagIds = new Set(tags.map((tag) => tag.id));
    }
    const plan = planQuickAddTask(draft, refs);
    if (!plan) return { taskId: null };
    const task = await this.tasks.createFromQuickAdd(userId, id, plan);
    return { taskId: task?.id ?? null };
  }
}
