import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto) {
    const max = await this.prisma.project.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    return this.prisma.project.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        areaId: dto.areaId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.project.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    await this.findOne(userId, id);
    return this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title,
        notes: dto.notes,
        areaId: dto.areaId,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.project.delete({ where: { id } });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.project.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Project not found');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.project.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}