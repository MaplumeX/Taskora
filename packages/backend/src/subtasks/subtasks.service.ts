import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus } from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubtaskDto, UpdateSubtaskDto } from './dto/subtasks.dto';

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

    return this.prisma.subtask.create({
      data: {
        title: dto.title,
        taskId,
        sortOrder,
      },
    });
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
      completedAt?: Date | null;
    } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === TaskStatus.COMPLETED) {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
    }

    return this.prisma.subtask.update({
      where: { id },
      data,
    });
  }

  async remove(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    await this.prisma.subtask.delete({ where: { id } });
  }

  async complete(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    return this.prisma.subtask.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async uncomplete(userId: string, id: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!subtask || subtask.task.userId !== userId) {
      throw new NotFoundException('Subtask not found');
    }

    return this.prisma.subtask.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        completedAt: null,
      },
    });
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
