import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdatePreferencesDto,
  DeleteAccountDto,
} from './dto/users.dto';

export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  preferences: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: USER_PUBLIC_SELECT,
    });
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password incorrect');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });

    return { ok: true };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const current = (user.preferences ?? {}) as Record<string, unknown>;
    const merged = { ...current, ...dto };

    return this.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged },
      select: USER_PUBLIC_SELECT,
    });
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Password incorrect');
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { ok: true };
  }

  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [tasks, projects, areas, tags, tagGroups, projectHeadings] =
      await Promise.all([
        this.prisma.task.findMany({
          where: { userId },
          include: { subtasks: true, tags: true },
        }),
        this.prisma.project.findMany({
          where: { userId },
          include: { tags: true },
        }),
        this.prisma.area.findMany({
          where: { userId },
          include: { tags: true },
        }),
        this.prisma.tag.findMany({ where: { userId } }),
        this.prisma.tagGroup.findMany({ where: { userId } }),
        this.prisma.projectHeading.findMany({ where: { userId } }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      version: '0.1.0',
      user,
      tasks,
      projects,
      areas,
      tags,
      tagGroups,
      projectHeadings,
    };
  }
}
