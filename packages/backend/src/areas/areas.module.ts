import { Module } from '@nestjs/common';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [SyncModule],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {}
