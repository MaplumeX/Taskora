import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Controller, Get } from '@nestjs/common';

import { SYNC_PROTOCOL_VERSION } from '@taskora/engine';

import { MIN_SYNC_PROTOCOL_VERSION } from '../sync/min-protocol';

/**
 * hub 的 app 版本：读 backend 的 package.json（`pnpm release` 与 tag 同步写入），
 * src/ 与 dist/ 下都在上两级。镜像构建参数 VERSION 在 main 构建时只是 `dev`，
 * 不能作为客户端的更新目标。
 */
const HUB_VERSION = (
  JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }
).version;

/**
 * Unauthenticated liveness probe used by clients and container healthchecks.
 * Also reports the hub version and accepted sync protocol range: clients
 * update up to this version and judge compatibility by the range (ADR-0025).
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      version: HUB_VERSION,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      minProtocolVersion: MIN_SYNC_PROTOCOL_VERSION,
    };
  }
}
