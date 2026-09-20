import { Module } from '@nestjs/common';

import { SyncController } from './sync.controller';
import { SyncHubService } from './sync-hub.service';
import { SyncEventBuffer } from './sync-event-buffer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [SyncController],
  providers: [SyncHubService, SyncEventBuffer],
  exports: [SyncHubService],
})
export class SyncModule {}
