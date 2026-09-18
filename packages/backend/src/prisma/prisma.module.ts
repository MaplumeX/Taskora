import { Global, Module } from '@nestjs/common';

import { ChangeEventCollector } from '../events/change-event.collector';
import { ChangeEventHub } from '../events/change-event-hub.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: ChangeEventCollector,
      useFactory: (hub: ChangeEventHub) => new ChangeEventCollector(hub),
      inject: [ChangeEventHub],
    },
    PrismaService,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
