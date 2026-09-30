import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { newRowOrder } from '../common/domain-storage';
import { CreateTagDto, UpdateTagDto } from './dto/tags.dto';

/** Tag 的 REST 写路径：写入经 Sync Hub 的合并器（虚拟设备 0）。 */
@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  private write(userId: string, id: string, fields: Record<string, unknown>) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('tag', id, fields);
      return batch.tx.tag.findUniqueOrThrow({ where: { id } });
    });
  }

  async create(userId: string, dto: CreateTagDto) {
    return this.write(userId, randomUUID(), {
      title: dto.title,
      color: dto.color ?? '#3B82F6',
      tagGroupId: dto.tagGroupId ?? null,
      // 新标签的位次口径不变：sortOrder 0 + 同口径合成的 Position
      ...newRowOrder(0),
    });
  }

  async findAll(userId: string) {
    return this.prisma.tag.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, userId },
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  async update(userId: string, id: string, dto: UpdateTagDto) {
    await this.findOne(userId, id);
    const fields: { title?: string; color?: string; tagGroupId?: string | null } = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.color !== undefined) fields.color = dto.color;
    if (dto.tagGroupId !== undefined) fields.tagGroupId = dto.tagGroupId;
    return this.write(userId, id, fields);
  }

  async remove(userId: string, id: string) {
    const tag = await this.findOne(userId, id);
    // TaskTag 关联通过 onDelete: Cascade 自动清理
    await this.hub.writeAsHub(userId, (batch) => batch.delete('tag', [id]));
    return tag;
  }
}
