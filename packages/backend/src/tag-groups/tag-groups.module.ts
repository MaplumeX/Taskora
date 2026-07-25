import { Module } from '@nestjs/common';
import { TagGroupsController } from './tag-groups.controller';
import { TagGroupsService } from './tag-groups.service';

@Module({
  controllers: [TagGroupsController],
  providers: [TagGroupsService],
})
export class TagGroupsModule {}