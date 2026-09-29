import { Module } from '@nestjs/common';

import { SyncController } from './sync.controller';
import { SyncHubService } from './sync-hub.service';
import { SyncChangeLog } from './sync-change-log';
import { PrismaSyncChangeLog } from './prisma-sync-change-log.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [SyncController],
  providers: [SyncHubService, { provide: SyncChangeLog, useClass: PrismaSyncChangeLog }],
  exports: [SyncHubService],
})
export class SyncModule {}
