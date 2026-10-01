import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { newRowOrder, orderFields } from '../common/domain-storage';
import { sortByPosition } from '../common/position-order';
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
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    // 按有效 Position 排序（与桌面端副本同一口径）
    return sortByPosition(tags);
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

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.tag.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true, createdAt: true },
    });
    if (owned.length !== new Set(orderedIds).size || owned.length !== orderedIds.length) {
      throw new NotFoundException('Tag not found');
    }
    // 双排序键一起写（与 ProjectsService.reorder 同理由）
    const createdAtOf = new Map(owned.map((t) => [t.id, t.createdAt]));
    await this.hub.writeAsHub(userId, async (batch) => {
      for (const [index, id] of orderedIds.entries()) {
        await batch.write('tag', id, orderFields(index, createdAtOf.get(id)!));
      }
    });
  }

  async remove(userId: string, id: string) {
    const tag = await this.findOne(userId, id);
    // TaskTag 关联通过 onDelete: Cascade 自动清理
    await this.hub.writeAsHub(userId, (batch) => batch.delete('tag', [id]));
    return tag;
  }
}
