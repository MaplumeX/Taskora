import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAreaDto, UpdateAreaDto } from './dto/areas.dto';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAreaDto) {
    const max = await this.prisma.area.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    return this.prisma.area.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.area.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const area = await this.prisma.area.findFirst({
      where: { id, userId },
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }
    return area;
  }

  async update(userId: string, id: string, dto: UpdateAreaDto) {
    await this.findOne(userId, id);
    return this.prisma.area.update({
      where: { id },
      data: {
        title: dto.title,
        notes: dto.notes,
      },
    });
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