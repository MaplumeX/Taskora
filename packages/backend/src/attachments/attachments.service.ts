import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { planReorder, positionAtEnd } from '@taskora/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { CreateAttachmentDto, UpdateAttachmentDto } from './dto/attachments.dto';

/**
 * Attachment 元数据的 REST 写路径（ADR-0019）：写入经 Sync Hub 的合并器
 * （虚拟设备 0）。Blob 走独立的 Blob 通道，这里不碰文件内容。
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  /** 读本用户的附件（经父 Task 认领），不存在即 404。 */
  private async requireAttachment(userId: string, id: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id },
      include: { task: { select: { userId: true } } },
    });
    if (!attachment || attachment.task.userId !== userId) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
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

  private write(userId: string, id: string, fields: Record<string, unknown>) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('attachment', id, fields);
      return batch.tx.attachment.findUniqueOrThrow({ where: { id } });
    });
  }

  async create(userId: string, taskId: string, dto: CreateAttachmentDto) {
    await this.requireTask(userId, taskId);

    if (dto.id) {
      const existing = await this.prisma.attachment.findUnique({ where: { id: dto.id } });
      if (existing) {
        // 客户端重试同一创建：同一 Task 下的同 id 视为已创建（幂等）
        if (existing.taskId === taskId) return existing;
        throw new ConflictException('Attachment id already exists');
      }
    }
    const siblings = await this.prisma.attachment.findMany({
      where: { taskId },
      select: { id: true, position: true },
    });
    return this.write(userId, dto.id ?? randomUUID(), {
      taskId,
      name: dto.name,
      mimeType: dto.mimeType,
      size: dto.size,
      blobHash: dto.blobHash,
      position: positionAtEnd(siblings),
    });
  }

  /** 只有文件名可改：内容（mimeType / size / blobHash）不可变。 */
  async update(userId: string, id: string, dto: UpdateAttachmentDto) {
    await this.requireAttachment(userId, id);
    return this.write(userId, id, dto.name === undefined ? {} : { name: dto.name });
  }

  async remove(userId: string, id: string) {
    await this.requireAttachment(userId, id);
    await this.hub.writeAsHub(userId, (batch) => batch.delete('attachment', [id]));
  }

  async reorder(userId: string, taskId: string, orderedIds: string[]) {
    await this.requireTask(userId, taskId);
    const owned = await this.prisma.attachment.findMany({
      where: { id: { in: orderedIds }, taskId },
      select: { id: true, position: true },
    });
    if (owned.length !== orderedIds.length) {
      throw new NotFoundException('Attachment not found');
    }
    await this.hub.writeAsHub(userId, async (batch) => {
      for (const { id, patch } of planReorder(owned, orderedIds)) {
        await batch.write('attachment', id, patch);
      }
    });
  }
}
