import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAreaDto, UpdateAreaDto } from './dto/areas.dto';

const TAG_INCLUDE = { tags: { include: { tag: true } } } as const;

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAreaDto) {
    const max = await this.prisma.area.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.area.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        userId,
        ...(dto.tagIds?.length
          ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      include: TAG_INCLUDE,
    });
    return { ...created, tags: created.tags.map((at) => at.tag) };
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

    // 全量 set 语义：tagIds 传 undefined 不动；传数组则先删旧关联再建新关联
    if (dto.tagIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.areaTag.deleteMany({ where: { areaId: id } }),
        ...(dto.tagIds.length > 0
          ? [
              this.prisma.areaTag.createMany({
                data: dto.tagIds.map((tagId) => ({ areaId: id, tagId })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    }

    const updated = await this.prisma.area.update({
      where: { id },
      data: {
        title: dto.title,
        notes: dto.notes,
      },
      include: TAG_INCLUDE,
    });
    return { ...updated, tags: updated.tags.map((at) => at.tag) };
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.area.delete({ where: { id } });
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

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.area.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}
