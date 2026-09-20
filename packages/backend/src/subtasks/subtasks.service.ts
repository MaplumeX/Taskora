import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { registerCompacted } from '../sync/compact-registry';
import { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtasks.dto';
import { settledToCompletedAt } from '../tasks/task-dto.mapper';

@Injectable()
export class SubtasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, taskId: string, dto: CreateSubtaskDto) {
    // Validate task ownership
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Compute next sortOrder (max + 1)
    const max = await this.prisma.subtask.aggregate({
      where: { taskId },
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;

    const created = await this.prisma.subtask.create({
      data: {
        title: dto.title,
        taskId,
        sortOrder,
      },
    });
    return settledToCompletedAt(created);
  }

  async update(userId: string, id: string, dto: UpdateSubtaskDto) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    const data: {
      title?: string;
      status?: TaskStatus;
      settledAt?: Date | null;
    } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === TaskStatus.COMPLETED || dto.status === TaskStatus.CANCELLED) {
        data.settledAt = new Date();
      } else {
        data.settledAt = null;
      }
    }

    const updated = await this.prisma.subtask.update({
      where: { id },
      data,
    });
    return settledToCompletedAt(updated);
  }

  async remove(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await registerCompacted(tx, userId, 'subtask', [id]);
      await tx.subtask.delete({ where: { id } });
    });
  }

  async complete(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    const updated = await this.prisma.subtask.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        settledAt: new Date(),
      },
    });
    return settledToCompletedAt(updated);
  }

  async uncomplete(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    const updated = await this.prisma.subtask.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
    });
    return settledToCompletedAt(updated);
  }

  async cancel(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    const updated = await this.prisma.subtask.update({
      where: { id },
      data: {
        status: TaskStatus.CANCELLED,
        settledAt: new Date(),
      },
    });
    return settledToCompletedAt(updated);
  }

  async uncancel(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    const updated = await this.prisma.subtask.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
    });
    return settledToCompletedAt(updated);
  }

  async reorder(userId: string, taskId: string, orderedIds: string[]) {
    // Validate task ownership
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate all subtask ids belong to this task
    const owned = await this.prisma.subtask.findMany({
      where: { id: { in: orderedIds }, taskId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((s) => s.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Subtask not found');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.subtask.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}
