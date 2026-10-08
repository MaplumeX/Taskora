import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  planMarkReviewed,
  planReorder,
  planReviewSchedule,
  planReviewUpdate,
  positionAtEnd,
} from '@taskora/engine';
import { withReviewDto } from '../common/review-dto';
import { sortByPosition } from '../common/position-order';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { userCalendarZones, userReviewSettings } from '../users/account-time-zone';
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
      return { ...withReviewDto(area), tags: area.tags.map((at) => at.tag) };
    });
  }

  async create(userId: string, dto: CreateAreaDto) {
    // 追加末尾
    const existing = await this.prisma.area.findMany({
      where: { userId },
      select: { id: true, position: true },
    });
    const { zones, review } = await userReviewSettings(this.prisma, userId);
    return this.write(userId, randomUUID(), {
      title: dto.title,
      notes: dto.notes ?? null,
      position: positionAtEnd(existing),
      tagIds: dto.tagIds ?? [],
      ...planReviewSchedule(review, 'area', dto, zones),
    });
  }

  async findAll(userId: string) {
    const areas = await this.prisma.area.findMany({
      where: { userId },
      include: TAG_INCLUDE,
    });
    return sortByPosition(areas).map((a) => ({
      ...withReviewDto(a),
      tags: a.tags.map((at) => at.tag),
    }));
  }

  async findOne(userId: string, id: string) {
    const area = await this.prisma.area.findFirst({
      where: { id, userId },
      include: TAG_INCLUDE,
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }
    return { ...withReviewDto(area), tags: area.tags.map((at) => at.tag) };
  }

  async update(userId: string, id: string, dto: UpdateAreaDto) {
    await this.findOne(userId, id);
    // 全量 set 语义：tagIds 传 undefined 不动；传数组则整组替换
    const fields: Record<string, unknown> = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.notes !== undefined) fields.notes = dto.notes;
    if (dto.tagIds !== undefined) fields.tagIds = dto.tagIds;
    Object.assign(fields, planReviewUpdate(dto, await userCalendarZones(this.prisma, userId)));
    return this.write(userId, id, fields);
  }

  /** 标记已回顾：下次回顾日从原日期加回顾间隔（规则见 domain planMarkReviewed）。 */
  async markReviewed(userId: string, id: string) {
    const area = await this.findOne(userId, id);
    const { zones, review } = await userReviewSettings(this.prisma, userId);
    return this.write(userId, id, {
      ...planMarkReviewed(area, 'area', review, zones),
    });
  }

  async remove(userId: string, id: string) {
    const area = await this.findOne(userId, id);
    await this.hub.writeAsHub(userId, (batch) => batch.delete('area', [id]));
    return area;
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.area.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true, position: true },
    });
    if (owned.length !== new Set(orderedIds).size || owned.length !== orderedIds.length) {
      throw new NotFoundException('Area not found');
    }

    await this.hub.writeAsHub(userId, async (batch) => {
      for (const { id, patch } of planReorder(owned, orderedIds)) {
        await batch.write('area', id, patch);
      }
    });
  }
}
