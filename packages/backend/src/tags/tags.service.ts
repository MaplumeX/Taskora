import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto/tags.dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTagDto) {
    return this.prisma.tag.create({
      data: {
        title: dto.title,
        color: dto.color ?? '#3B82F6',
        tagGroupId: dto.tagGroupId ?? null,
        userId,
      },
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
    const data: { title?: string; color?: string; tagGroupId?: string | null } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.tagGroupId !== undefined) data.tagGroupId = dto.tagGroupId;
    return this.prisma.tag.update({
      where: { id },
      data,
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    // TaskTag 关联通过 onDelete: Cascade 自动清理
    return this.prisma.tag.delete({ where: { id } });
  }
}