import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { USER_PUBLIC_SELECT } from '../users/users.service';
import {
  generateRt,
  hashRt,
  RT_COOKIE_NAME,
  RT_TTL_MS,
  COOKIE_OPTS,
} from './refresh-token.helpers';

export { RT_COOKIE_NAME, COOKIE_OPTS };

interface RotatedTokens {
  accessToken: string;
  user: { id: string; email: string; displayName: string | null; avatarUrl: string | null };
  newRt: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        preferences: true,
      },
    });

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.jwtService.sign({ sub: user.id });
    const rt = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      rt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        preferences: user.preferences,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_PUBLIC_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    return user;
  }

  // --- Refresh token ---

  async issueRefreshToken(userId: string, familyId?: string): Promise<string> {
    const family = familyId ?? randomUUID();
    const rt = generateRt();
    const tokenHash = hashRt(rt);
    const expiresAt = new Date(Date.now() + RT_TTL_MS);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId: family, expiresAt },
    });

    return rt;
  }

  async rotateRefreshToken(incomingRt: string): Promise<RotatedTokens> {
    const tokenHash = hashRt(incomingRt);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Expired
    if (row.expiresAt < new Date()) {
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Reuse detection: token was already revoked
    if (row.revokedAt !== null) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Normal rotation: revoke old + issue new in a transaction
    const newRt = generateRt();
    const newHash = hashRt(newRt);
    const expiresAt = new Date(Date.now() + RT_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: row.userId,
          tokenHash: newHash,
          familyId: row.familyId,
          expiresAt,
        },
      }),
    ]);

    const user = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        preferences: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const accessToken = this.jwtService.sign({ sub: row.userId });

    return { accessToken, user, newRt };
  }

  async revokeRefreshToken(rt?: string): Promise<void> {
    if (!rt) return;
    const tokenHash = hashRt(rt);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
