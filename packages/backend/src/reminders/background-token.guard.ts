import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { hashBackgroundToken } from './background-token';

/**
 * 只认设备后台凭据（见 background-token.ts），不认会话 JWT：这条路径上
 * 的请求只来自 Android 原生的后台同步。通过后 req.user 与 JwtAuthGuard
 * 同形（`{ id }`）。
 */
@Injectable()
export class BackgroundTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string };
    }>();
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException();
    const device = await this.prisma.device.findUnique({
      where: { backgroundTokenHash: hashBackgroundToken(match[1]) },
      select: { userId: true, backgroundTokenExpiresAt: true },
    });
    if (!device?.backgroundTokenExpiresAt || device.backgroundTokenExpiresAt <= new Date()) {
      throw new UnauthorizedException();
    }
    req.user = { id: device.userId };
    return true;
  }
}
