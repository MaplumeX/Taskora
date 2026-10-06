import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { planReorder, positionBetween, tagParentCreatesCycle } from '@taskora/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { edgePositions } from '../common/domain-storage';
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

  /**
   * 校验父 Tag：必须是该用户的 Tag，且不能让树成环（嵌套 Tag，ADR-0016）。
   * 并发写出的环由 hub 合并后修复，这里只拒绝能直接看出来的。
   */
  private async assertParent(userId: string, id: string, parentId: string | null | undefined) {
    if (parentId == null) return;
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      select: { id: true, parentId: true },
    });
    const parents = new Map(tags.map((tag) => [tag.id, tag.parentId]));
    if (!parents.has(parentId)) throw new NotFoundException('Parent tag not found');
    if (tagParentCreatesCycle(id, parentId, (tagId) => parents.get(tagId))) {
      throw new BadRequestException('A tag cannot be nested inside itself or its descendants');
    }
  }

  async create(userId: string, dto: CreateTagDto) {
    const id = randomUUID();
    await this.assertParent(userId, id, dto.parentId);
    return this.hub.writeAsHub(userId, async (batch) => {
      // 新标签排最前（与设备 Engine 后端同一口径）
      const { first } = await edgePositions(batch.tx, 'Tag', userId);
      await batch.write('tag', id, {
        title: dto.title,
        color: dto.color ?? '#3B82F6',
        parentId: dto.parentId ?? null,
        position: positionBetween(null, first),
      });
      return batch.tx.tag.findUniqueOrThrow({ where: { id } });
    });
  }

  async findAll(userId: string) {
    const tags = await this.prisma.tag.findMany({ where: { userId } });
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
    await this.assertParent(userId, id, dto.parentId);
    const fields: { title?: string; color?: string; parentId?: string | null } = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.color !== undefined) fields.color = dto.color;
    if (dto.parentId !== undefined) fields.parentId = dto.parentId;
    return this.write(userId, id, fields);
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.tag.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true, position: true },
    });
    if (owned.length !== new Set(orderedIds).size || owned.length !== orderedIds.length) {
      throw new NotFoundException('Tag not found');
    }
    // 只给必须移动的行分配新 Position（与设备 Engine 后端同一口径）
    await this.hub.writeAsHub(userId, async (batch) => {
      for (const { id, patch } of planReorder(owned, orderedIds)) {
        await batch.write('tag', id, patch);
      }
    });
  }

  async remove(userId: string, id: string) {
    const tag = await this.findOne(userId, id);
    // TaskTag 关联通过 onDelete: Cascade 自动清理；子 Tag 经 onDelete: SetNull 提升为顶层
    await this.hub.writeAsHub(userId, (batch) => batch.delete('tag', [id]));
    return tag;
  }
}
