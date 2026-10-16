import { Module } from '@nestjs/common';

import { BlobsModule } from '../blobs/blobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SyncModule } from '../sync/sync.module';
import { DataImportService } from './data-import.service';
import { DataPackageController } from './data-package.controller';
import { DataPackageService } from './data-package.service';
import { ImportUploads } from './import-uploads';

@Module({
  imports: [PrismaModule, BlobsModule, SyncModule],
  controllers: [DataPackageController],
  providers: [
    DataPackageService,
    DataImportService,
    { provide: ImportUploads, useFactory: () => new ImportUploads() },
  ],
})
export class DataPackageModule {}
