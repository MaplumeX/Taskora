import { Module } from '@nestjs/common';
import { TagGroupsController } from './tag-groups.controller';
import { TagGroupsService } from './tag-groups.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [TagGroupsController],
  providers: [TagGroupsService],
  exports: [TagGroupsService],
})
export class TagGroupsModule {}
