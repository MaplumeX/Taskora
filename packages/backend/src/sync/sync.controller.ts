import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';

import { SyncHubService } from './sync-hub.service';
import { PushRequestDto, RegisterDeviceDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 同步端点（ADR-0007）：对外公共面收敛为 push batch / pull since cursor /
 * bootstrap snapshot；设备身份注册。
 */
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncHub: SyncHubService) {}

  @Post('devices')
  registerDevice(@Request() req: { user: { id: string } }, @Body() dto: RegisterDeviceDto) {
    return this.syncHub.registerDevice(req.user.id, dto.deviceId, dto.label);
  }

  // 每个响应都回报 serverTime：设备据此校准 HLC 墙钟，以 hub 时间为
  // 共同基准（与 hub 以虚拟设备 0 合成的时钟可比，ADR-0007）。

  @Post('push')
  async push(@Request() req: { user: { id: string } }, @Body() dto: PushRequestDto) {
    return withServerTime(await this.syncHub.push(req.user.id, dto.events, dto.deletes));
  }

  @Get('pull')
  async pull(
    @Request() req: { user: { id: string } },
    @Query('cursor') cursorRaw: string | undefined,
  ) {
    const cursor = Number.parseInt(cursorRaw ?? '0', 10);
    const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    return withServerTime(await this.syncHub.pull(req.user.id, safeCursor));
  }

  @Get('bootstrap')
  async bootstrap(@Request() req: { user: { id: string } }) {
    return withServerTime(await this.syncHub.bootstrap(req.user.id));
  }
}

function withServerTime<T extends object>(response: T): T & { serverTime: number } {
  return { ...response, serverTime: Date.now() };
}
