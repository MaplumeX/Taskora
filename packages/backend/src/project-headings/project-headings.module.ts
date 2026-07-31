import { Module } from '@nestjs/common';
import { ProjectHeadingsController } from './project-headings.controller';
import { ProjectHeadingsService } from './project-headings.service';

@Module({
  controllers: [ProjectHeadingsController],
  providers: [ProjectHeadingsService],
})
export class ProjectHeadingsModule {}
