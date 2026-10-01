import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { CreateTagGroupDto, UpdateTagGroupDto } from './dto/tag-groups.dto';

/** TagGroup 的 REST 写路径：写入经 Sync Hub 的合并器（虚拟设备 0）。 */
@Injectable()
export class TagGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  private write(userId: string, id: string, fields: Record<string, unknown>) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('tag-group', id, fields);
      return batch.tx.tagGroup.findUniqueOrThrow({ where: { id }, include: { tags: true } });
    });
  }

  async create(userId: string, dto: CreateTagGroupDto) {
    return this.write(userId, randomUUID(), { title: dto.title, sortOrder: 0 });
  }

  async findAll(userId: string) {
    return this.prisma.tagGroup.findMany({
      where: { userId },
      include: { tags: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const tagGroup = await this.prisma.tagGroup.findFirst({
      where: { id, userId },
      include: { tags: true },
    });
    if (!tagGroup) {
      throw new NotFoundException('TagGroup not found');
    }
    return tagGroup;
  }

  async update(userId: string, id: string, dto: UpdateTagGroupDto) {
    await this.findOne(userId, id);
    return this.write(userId, id, dto.title === undefined ? {} : { title: dto.title });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.tagGroup.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true },
    });
    if (owned.length !== new Set(orderedIds).size || owned.length !== orderedIds.length) {
      throw new NotFoundException('TagGroup not found');
    }
    await this.hub.writeAsHub(userId, async (batch) => {
      for (const [index, id] of orderedIds.entries()) {
        await batch.write('tag-group', id, { sortOrder: index });
      }
    });
  }

  async remove(userId: string, id: string) {
    const tagGroup = await this.findOne(userId, id);
    // 删除分组后，其下 Tag 的 tagGroupId 通过 onDelete: SetNull 自动置 null
    await this.hub.writeAsHub(userId, (batch) => batch.delete('tag-group', [id]));
    return tagGroup;
  }
}
