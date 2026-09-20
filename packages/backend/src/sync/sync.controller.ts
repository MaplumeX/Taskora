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
  registerDevice(
    @Request() req: { user: { id: string } },
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.syncHub.registerDevice(req.user.id, dto.deviceId, dto.label);
  }

  @Post('push')
  push(@Request() req: { user: { id: string } }, @Body() dto: PushRequestDto) {
    return this.syncHub.push(req.user.id, dto.events);
  }

  @Get('pull')
  pull(
    @Request() req: { user: { id: string } },
    @Query('cursor') cursorRaw: string | undefined,
  ) {
    const cursor = Number.parseInt(cursorRaw ?? '0', 10);
    const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    return this.syncHub.pull(req.user.id, safeCursor);
  }

  @Get('bootstrap')
  bootstrap(@Request() req: { user: { id: string } }) {
    return this.syncHub.bootstrap(req.user.id);
  }
}
