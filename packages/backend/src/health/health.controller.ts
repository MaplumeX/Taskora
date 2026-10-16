import { Controller, Get } from '@nestjs/common';

import { SYNC_PROTOCOL_VERSION } from '@taskora/engine';

import { HUB_VERSION } from '../common/hub-version';
import { MIN_SYNC_PROTOCOL_VERSION } from '../sync/min-protocol';

/**
 * Unauthenticated liveness probe used by clients and container healthchecks.
 * Also reports the hub version and accepted sync protocol range: clients
 * update up to this version and judge compatibility by the range (ADR-0026).
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
