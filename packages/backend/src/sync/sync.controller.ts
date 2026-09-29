import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { SYNC_PROTOCOL_HEADER, SYNC_PROTOCOL_VERSION } from '@taskora/engine';

import { SyncHubService } from './sync-hub.service';
import { PushRequestDto, RegisterDeviceDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * hub 仍接受的最低同步协议版本（ADR-0007「协议版本」）。0 = 不带版本头的
 * 客户端（协议版本出现之前的桌面 / 移动安装）。只在旧客户端会把数据
 * 写坏或无法理解 hub 下发的内容时才提高它。
 */
export const MIN_SYNC_PROTOCOL_VERSION = 0;

/** HTTP 426 Upgrade Required（Nest 的 HttpStatus 未收录）。 */
const UPGRADE_REQUIRED = 426;

/**
 * 请求的协议版本：缺省（旧客户端）为 0；低于最低版本回 426，客户端停止
 * 同步并提示升级，Outbox 保留。比 hub 新的版本照常处理（按能力降级：
 * 不认识的实体 / 字段由 push 逐条拒绝）。
 */
export function assertSyncProtocol(
  raw: string | undefined,
  minVersion = MIN_SYNC_PROTOCOL_VERSION,
): number {
  const parsed = raw === undefined ? 0 : Number.parseInt(raw, 10);
  const version = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  if (version < minVersion) {
    throw new HttpException(
      {
        statusCode: UPGRADE_REQUIRED,
        message: '同步协议版本过旧，请升级 Taskora',
        protocolVersion: SYNC_PROTOCOL_VERSION,
        minProtocolVersion: minVersion,
      },
      UPGRADE_REQUIRED,
    );
  }
  return version;
}

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
  // 共同基准（与 hub 以虚拟设备 0 合成的时钟可比，ADR-0007）；以及
  // hub 的协议版本与最低版本（issue 03）。

  @Post('push')
  async push(
    @Request() req: { user: { id: string } },
    @Headers(SYNC_PROTOCOL_HEADER) protocol: string | undefined,
    @Body() dto: PushRequestDto,
  ) {
    assertSyncProtocol(protocol);
    return withHubInfo(await this.syncHub.push(req.user.id, dto.events, dto.deletes));
  }

  @Get('pull')
  async pull(
    @Request() req: { user: { id: string } },
    @Headers(SYNC_PROTOCOL_HEADER) protocol: string | undefined,
    @Query('cursor') cursorRaw: string | undefined,
  ) {
    assertSyncProtocol(protocol);
    const cursor = Number.parseInt(cursorRaw ?? '0', 10);
    const safeCursor = Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0;
    return withHubInfo(await this.syncHub.pull(req.user.id, safeCursor));
  }

  @Get('bootstrap')
  async bootstrap(
    @Request() req: { user: { id: string } },
    @Headers(SYNC_PROTOCOL_HEADER) protocol: string | undefined,
  ) {
    assertSyncProtocol(protocol);
    return withHubInfo(await this.syncHub.bootstrap(req.user.id));
  }
}

function withHubInfo<T extends object>(
  response: T,
): T & { serverTime: number; protocolVersion: number; minProtocolVersion: number } {
  return {
    ...response,
    serverTime: Date.now(),
    protocolVersion: SYNC_PROTOCOL_VERSION,
    minProtocolVersion: MIN_SYNC_PROTOCOL_VERSION,
  };
}
