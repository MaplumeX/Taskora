import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BackgroundTokenGuard } from '../reminders/background-token.guard';
import { TasksModule } from '../tasks/tasks.module';
import { OutOfAppController } from './out-of-app.controller';
import { OutOfAppService } from './out-of-app.service';

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [OutOfAppController],
  providers: [OutOfAppService, BackgroundTokenGuard],
})
export class OutOfAppModule {}
