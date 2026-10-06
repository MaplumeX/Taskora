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

import { isSyncEntity, SYNC_PROTOCOL_HEADER, SYNC_PROTOCOL_VERSION } from '@taskora/engine';

import { SyncHubService } from './sync-hub.service';
import { FetchEntitiesDto, PushRequestDto, RegisterDeviceDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * hub 仍接受的最低同步协议版本（ADR-0007「协议版本」）。只在旧客户端会把
 * 数据写坏或无法理解 hub 下发的内容时才提高它。
 *
 * 4（retire-sort-order）：协议 3 及更早的客户端只按 sortOrder 排 Area /
 * ProjectHeading / TagGroup / Subtask，重排也只写 sortOrder——hub 不再认识
 * 这个字段，它们的重排会被永久拒在 Outbox 里、在其他设备上静默丢失。
 *
 * 5（嵌套 Tag，ADR-0016）：协议 4 的客户端还会写 tag-group 实体与 Tag 的
 * tagGroupId 字段，hub 已不认识它们；这些写会被永久拒在 Outbox 里，Tag
 * 层级在其他设备上静默丢失。
 */
export const MIN_SYNC_PROTOCOL_VERSION = 5;

/** HTTP 426 Upgrade Required（Nest 的 HttpStatus 未收录）。 */
const UPGRADE_REQUIRED = 426;

/** 分页 bootstrap 与按 id 取实体从这个协议版本起（local-first-v3 issue 08）。 */
const PAGED_BOOTSTRAP_PROTOCOL = 2;

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
    return this.syncHub.registerDevice(req.user.id, dto.deviceId, dto.label, dto.backgroundToken);
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

  /**
   * 协议 2 起分页：page 为上一页的 next，settledAfter 为归档截止（只在
   * 第一页生效）。更早的客户端不认识 next，仍回整包快照。
   */
  @Get('bootstrap')
  async bootstrap(
    @Request() req: { user: { id: string } },
    @Headers(SYNC_PROTOCOL_HEADER) protocol: string | undefined,
    @Query('page') page: string | undefined,
    @Query('settledAfter') settledAfter: string | undefined,
  ) {
    const version = assertSyncProtocol(protocol);
    if (version < PAGED_BOOTSTRAP_PROTOCOL) {
      return withHubInfo(await this.syncHub.bootstrap(req.user.id));
    }
    return withHubInfo(await this.syncHub.bootstrapPage(req.user.id, { page, settledAfter }));
  }

  /** 按 id 取实体及其级联子实体（协议 2 起：归档任务回到副本时补齐 Subtask）。 */
  @Post('entities')
  async fetchEntities(
    @Request() req: { user: { id: string } },
    @Headers(SYNC_PROTOCOL_HEADER) protocol: string | undefined,
    @Body() dto: FetchEntitiesDto,
  ) {
    assertSyncProtocol(protocol);
    if (!isSyncEntity(dto.entity)) return withHubInfo({ entries: [] });
    return withHubInfo(await this.syncHub.fetchEntities(req.user.id, dto.entity, dto.ids));
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
