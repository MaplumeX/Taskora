import { Global, Module } from '@nestjs/common';

import { ChangeEventHub } from './change-event-hub.service';
import { EventsController } from './events.controller';

/**
 * Change Event production + the per-user Event Stream endpoint (ADR 0005).
 *
 * The collector is instantiated by PrismaService (it needs the raw
 * PrismaClient before extensions are applied), so this module provides the
 * hub it publishes through, plus the GET /events SSE endpoint. Marked global
 * so PrismaModule can inject the hub without import cycles.
 */
@Global()
@Module({
  providers: [ChangeEventHub],
  controllers: [EventsController],
  exports: [ChangeEventHub],
})
export class EventsModule {}
