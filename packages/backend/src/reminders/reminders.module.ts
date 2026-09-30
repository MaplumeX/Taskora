import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { BackgroundTokenGuard } from './background-token.guard';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [PrismaModule, SyncModule],
  controllers: [RemindersController],
  providers: [RemindersService, BackgroundTokenGuard],
})
export class RemindersModule {}
