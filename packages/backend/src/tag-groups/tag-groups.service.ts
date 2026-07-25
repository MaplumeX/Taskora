import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagGroupDto, UpdateTagGroupDto } from './dto/tag-groups.dto';

@Injectable()
export class TagGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTagGroupDto) {
    return this.prisma.tagGroup.create({
      data: {
        title: dto.title,
        userId,
      },
      include: { tags: true },
    });
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
    return this.prisma.tagGroup.update({
      where: { id },
      data: { title: dto.title },
      include: { tags: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    // 删除分组后，其下 Tag 的 tagGroupId 通过 onDelete: SetNull 自动置 null
    return this.prisma.tagGroup.delete({ where: { id } });
  }
}