import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { CreateAreaDto, UpdateAreaDto } from './dto/areas.dto';

const TAG_INCLUDE = { tags: { include: { tag: true } } } as const;

/** Area 的 REST 写路径：写入经 Sync Hub 的合并器（虚拟设备 0）。 */
@Injectable()
export class AreasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  /** 写一组字段并返回写后的 DTO（标签展开）。 */
  private write(userId: string, id: string, fields: Record<string, unknown>) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('area', id, fields);
      const area = await batch.tx.area.findUniqueOrThrow({ where: { id }, include: TAG_INCLUDE });
      return { ...area, tags: area.tags.map((at) => at.tag) };
    });
  }

  async create(userId: string, dto: CreateAreaDto) {
    const max = await this.prisma.area.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    return this.write(userId, randomUUID(), {
      title: dto.title,
      notes: dto.notes ?? null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
      tagIds: dto.tagIds ?? [],
    });
  }

  async findAll(userId: string) {
    const areas = await this.prisma.area.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: TAG_INCLUDE,
    });
    return areas.map((a) => ({ ...a, tags: a.tags.map((at) => at.tag) }));
  }

  async findOne(userId: string, id: string) {
    const area = await this.prisma.area.findFirst({
      where: { id, userId },
      include: TAG_INCLUDE,
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }
    return { ...area, tags: area.tags.map((at) => at.tag) };
  }

  async update(userId: string, id: string, dto: UpdateAreaDto) {
    await this.findOne(userId, id);
    // 全量 set 语义：tagIds 传 undefined 不动；传数组则整组替换
    const fields: Record<string, unknown> = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.notes !== undefined) fields.notes = dto.notes;
    if (dto.tagIds !== undefined) fields.tagIds = dto.tagIds;
    return this.write(userId, id, fields);
  }

  async remove(userId: string, id: string) {
    const area = await this.findOne(userId, id);
    await this.hub.writeAsHub(userId, (batch) => batch.delete('area', [id]));
    return area;
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.area.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((a) => a.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Area not found');
    }

    await this.hub.writeAsHub(userId, async (batch) => {
      for (const [index, id] of orderedIds.entries()) {
        await batch.write('area', id, { sortOrder: index });
      }
    });
  }
}
