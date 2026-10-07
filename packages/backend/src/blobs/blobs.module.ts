import { resolve } from 'node:path';

import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BlobGcService } from './blob-gc.service';
import { BlobStore } from './blob-store';
import { BlobsController } from './blobs.controller';
import { FsBlobStore } from './fs-blob-store';

/** Blob 根目录：BLOB_STORAGE_DIR，缺省为工作目录下的 data/blobs。 */
export function blobStorageDir(): string {
  return resolve(process.env.BLOB_STORAGE_DIR ?? 'data/blobs');
}

@Module({
  imports: [PrismaModule],
  controllers: [BlobsController],
  providers: [
    { provide: BlobStore, useFactory: () => new FsBlobStore(blobStorageDir()) },
    BlobGcService,
  ],
  exports: [BlobStore],
})
export class BlobsModule {}
