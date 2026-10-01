import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { subtaskStatusPatch } from '@taskora/engine';
import { TaskStatus } from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtasks.dto';
import { settledToCompletedAt } from '../tasks/task-dto.mapper';
import { toWireFields } from '../common/domain-storage';

/** Subtask 的 REST 写路径：写入经 Sync Hub 的合并器（虚拟设备 0）。 */
@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  /** 读本用户的 Subtask（经父 Task 认领），不存在即 404。 */
  private async requireSubtask(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }
    return subtask;
  }

  private async requireTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }

  /** 写一组字段并返回写后的 DTO（settledAt → completedAt）。 */
  private write(userId: string, id: string, fields: Record<string, unknown>) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('subtask', id, fields);
      return settledToCompletedAt(await batch.tx.subtask.findUniqueOrThrow({ where: { id } }));
    });
  }

  async create(userId: string, taskId: string, dto: CreateSubtaskDto) {
    await this.requireTask(userId, taskId);

    if (dto.id) {
      const existing = await this.prisma.subtask.findUnique({ where: { id: dto.id } });
      if (existing) {
        // 客户端重试同一创建：同一 Task 下的同 id 视为已创建（幂等）
        if (existing.taskId === taskId) return settledToCompletedAt(existing);
        throw new ConflictException('Subtask id already exists');
      }
    }
    const id = dto.id ?? randomUUID();
    const fields = { title: dto.title, status: TaskStatus.ACTIVE, settledAt: null, taskId };

    const siblings = dto.afterId
      ? await this.prisma.subtask.findMany({
          where: { taskId },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, sortOrder: true },
        })
      : [];
    const afterIndex = siblings.findIndex((s) => s.id === dto.afterId);
    if (afterIndex < 0) {
      // Compute next sortOrder (max + 1)
      const max = await this.prisma.subtask.aggregate({
        where: { taskId },
        _max: { sortOrder: true },
      });
      return this.write(userId, id, { ...fields, sortOrder: (max._max.sortOrder ?? -1) + 1 });
    }

    // 插入到 afterId 之后：整体重排为 0..n，插入点之后的各项顺延一位
    const insertAt = afterIndex + 1;
    return this.hub.writeAsHub(userId, async (batch) => {
      for (const [index, sibling] of siblings.entries()) {
        const sortOrder = index < insertAt ? index : index + 1;
        if (sibling.sortOrder !== sortOrder) {
          await batch.write('subtask', sibling.id, { sortOrder });
        }
      }
      await batch.write('subtask', id, { ...fields, sortOrder: insertAt });
      return settledToCompletedAt(await batch.tx.subtask.findUniqueOrThrow({ where: { id } }));
    });
  }

  async update(userId: string, id: string, dto: UpdateSubtaskDto) {
    await this.requireSubtask(userId, id);
    const fields: Record<string, unknown> = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.status !== undefined) {
      Object.assign(fields, toWireFields(subtaskStatusPatch(dto.status, new Date().toISOString())));
    }
    return this.write(userId, id, fields);
  }

  async remove(userId: string, id: string) {
    await this.requireSubtask(userId, id);
    await this.hub.writeAsHub(userId, (batch) => batch.delete('subtask', [id]));
  }

  async complete(userId: string, id: string) {
    return this.setStatus(userId, id, TaskStatus.COMPLETED);
  }

  async uncomplete(userId: string, id: string) {
    return this.setStatus(userId, id, TaskStatus.ACTIVE);
  }

  async cancel(userId: string, id: string) {
    return this.setStatus(userId, id, TaskStatus.CANCELLED);
  }

  async uncancel(userId: string, id: string) {
    return this.setStatus(userId, id, TaskStatus.ACTIVE);
  }

  private async setStatus(userId: string, id: string, status: TaskStatus) {
    await this.requireSubtask(userId, id);
    return this.write(
      userId,
      id,
      toWireFields(subtaskStatusPatch(status, new Date().toISOString())),
    );
  }

  async reorder(userId: string, taskId: string, orderedIds: string[]) {
    await this.requireTask(userId, taskId);

    // Validate all subtask ids belong to this task
    const owned = await this.prisma.subtask.findMany({
      where: { id: { in: orderedIds }, taskId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((s) => s.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Subtask not found');
    }

    await this.hub.writeAsHub(userId, async (batch) => {
      for (const [index, id] of orderedIds.entries()) {
        await batch.write('subtask', id, { sortOrder: index });
      }
    });
  }
}
