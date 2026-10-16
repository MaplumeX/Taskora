import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { SYNC_ENTITIES } from '@taskora/engine';
import {
  DATA_PACKAGE_BLOB_DIR,
  DATA_PACKAGE_DATA_PATH,
  DATA_PACKAGE_FORMAT,
  DATA_PACKAGE_MANIFEST_PATH,
  type DataPackageData,
  type DataPackageManifest,
} from '@taskora/shared';
import { ZipFile } from 'yazl';

import { BlobStore } from '../blobs/blob-store';
import { HUB_VERSION } from '../common/hub-version';
import { PrismaService } from '../prisma/prisma.service';
import { codecFor, loadAllRows, wireViewOfRow } from '../sync/entity-codec';

/**
 * 数据包导出（`.scratch/data-import/spec.md`）：全部同步实体（含 Trash 与
 * 归档任务）的 wire 字段、偏好、日历订阅，以及可选的附件文件，打成一个
 * zip 流。账号凭据、设备、助手配置与会话、同步内部状态不导出。
 */
@Injectable()
export class DataPackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobs: BlobStore,
  ) {}

  /**
   * 读出全部数据并返回 zip 输出流。数据在返回前读完（data.json 在内存中，
   * 规模同 bootstrap 快照）；附件文件在写到该条目时才打开，内存不随文件
   * 大小增长。
   */
  async exportPackage(
    userId: string,
    options: { includeBlobs: boolean },
  ): Promise<{ manifest: DataPackageManifest; stream: NodeJS.ReadableStream }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const entities: DataPackageData['entities'] = {};
    const counts: Record<string, number> = {};
    for (const entity of SYNC_ENTITIES) {
      const codec = codecFor(entity);
      const rows = await loadAllRows(this.prisma, codec, userId);
      entities[entity] = rows.map((row) => ({
        id: row.id as string,
        fields: wireViewOfRow(codec, row),
      }));
      counts[entity] = rows.length;
    }

    const subscriptions = (await this.prisma.calendarSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { name: true, url: true, color: true, enabled: true },
    })) as DataPackageData['calendarSubscriptions'];
    counts.calendarSubscriptions = subscriptions.length;

    // 同一内容的多个附件共用一个 Blob；hub 上缺失的（尚未上传完）不打包，
    // 导入时对应附件按「缺文件」跳过。
    const blobHashes: string[] = [];
    if (options.includeBlobs) {
      const referenced = new Set(entities.attachment.map((row) => row.fields.blobHash as string));
      for (const hash of referenced) {
        if (await this.blobs.stat(userId, hash)) blobHashes.push(hash);
      }
    }
    counts.blobs = blobHashes.length;

    const manifest: DataPackageManifest = {
      format: DATA_PACKAGE_FORMAT,
      exportId: randomUUID(),
      exportedAt: new Date().toISOString(),
      hubVersion: HUB_VERSION,
      includesBlobs: options.includeBlobs,
      counts,
    };
    const data: DataPackageData = {
      entities,
      preferences: (user.preferences ?? null) as DataPackageData['preferences'],
      calendarSubscriptions: subscriptions,
    };

    const zip = new ZipFile();
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), DATA_PACKAGE_MANIFEST_PATH);
    zip.addBuffer(Buffer.from(JSON.stringify(data)), DATA_PACKAGE_DATA_PATH);
    for (const hash of blobHashes) {
      // 附件多为已压缩格式（图片、PDF），不再 deflate
      zip.addReadStreamLazy(`${DATA_PACKAGE_BLOB_DIR}${hash}`, { compress: false }, (cb) =>
        cb(null, this.blobs.read(userId, hash)),
      );
    }
    zip.end();
    return { manifest, stream: zip.outputStream };
  }
}
