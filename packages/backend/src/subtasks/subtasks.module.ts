import { Module } from '@nestjs/common';
import { SubtasksController } from './subtasks.controller';
import { SubtasksService } from './subtasks.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [SubtasksController],
  providers: [SubtasksService],
  exports: [SubtasksService],
})
export class SubtasksModule {}
