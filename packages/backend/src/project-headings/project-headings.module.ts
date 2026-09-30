import { Module } from '@nestjs/common';
import { ProjectHeadingsController } from './project-headings.controller';
import { ProjectHeadingsService } from './project-headings.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [ProjectHeadingsController],
  providers: [ProjectHeadingsService],
  exports: [ProjectHeadingsService],
})
export class ProjectHeadingsModule {}
