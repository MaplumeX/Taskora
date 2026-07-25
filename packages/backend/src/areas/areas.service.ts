import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAreaDto, UpdateAreaDto } from './dto/areas.dto';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAreaDto) {
    return this.prisma.area.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.area.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
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
}