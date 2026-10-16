import type { Readable } from 'node:stream';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DataImportPreview, DataImportStats } from '@taskora/shared';

import { BlobHashMismatchError, BlobStore } from '../blobs/blob-store';
import { edgePositions } from '../common/domain-storage';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { ImportUploads } from './import-uploads';
import { buildImportPlan, type ImportTarget } from './import-plan';
import { DataPackageError, upgradeDataPackage } from './package-format';
import { openPackage, type OpenedPackage } from './package-reader';

/**
 * 数据包导入（「导入为副本」，`.scratch/data-import/spec.md`）：上传落盘并
 * 预览，确认后先写 Blob，再在一个 writeAsHub 事务里写入全部行——经合并器
 * 与 repairEntity，变更日志随数据提交，设备经事件流拉到新数据。事务失败
 * 时已写的 Blob 由 Blob GC 在宽限期后回收。
 */
@Injectable()
export class DataImportService {
  /** 同一用户同时只允许一个导入。 */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
    private readonly blobs: BlobStore,
    private readonly uploads: ImportUploads,
  ) {}

  async preview(userId: string, source: Readable): Promise<DataImportPreview> {
    const uploadId = await this.uploads.save(userId, source);
    try {
      const { manifest } = await this.withPackage(userId, uploadId, async (opened) =>
        upgradeDataPackage(opened.manifestJson, opened.dataJson),
      );
      const previous = await this.prisma.dataImport.findFirst({
        where: { userId, exportId: manifest.exportId },
        orderBy: { importedAt: 'desc' },
        select: { importedAt: true },
      });
      return {
        uploadId,
        manifest: {
          format: manifest.format,
          exportedAt: manifest.exportedAt,
          hubVersion: manifest.hubVersion,
          includesBlobs: manifest.includesBlobs,
          counts: manifest.counts,
        },
        alreadyImportedAt: previous?.importedAt.toISOString() ?? null,
      };
    } catch (error) {
      await this.uploads.remove(userId, uploadId);
      throw error;
    }
  }

  async import(
    userId: string,
    uploadId: string,
    options: { importPreferences: boolean },
  ): Promise<DataImportStats> {
    if (this.running.has(userId)) throw new ConflictException('已有导入正在进行');
    this.running.add(userId);
    try {
      const stats = await this.withPackage(userId, uploadId, (opened) =>
        this.apply(userId, opened, options),
      );
      await this.uploads.remove(userId, uploadId);
      return stats;
    } finally {
      this.running.delete(userId);
    }
  }

  private async withPackage<T>(
    userId: string,
    uploadId: string,
    run: (opened: OpenedPackage) => Promise<T>,
  ): Promise<T> {
    const path = await this.uploads.find(userId, uploadId);
    if (!path) throw new NotFoundException('上传不存在或已过期，请重新选择文件');
    const opened = await openPackage(path);
    try {
      return await run(opened);
    } finally {
      opened.close();
    }
  }

  private async apply(
    userId: string,
    opened: OpenedPackage,
    options: { importPreferences: boolean },
  ): Promise<DataImportStats> {
    const { manifest, data } = upgradeDataPackage(opened.manifestJson, opened.dataJson);

    // 包内没带、但账号里已有的附件内容照常可用
    const accountBlobs = new Set<string>();
    for (const row of data.entities.attachment ?? []) {
      const hash = row.fields.blobHash;
      if (typeof hash !== 'string' || opened.blobHashes.has(hash) || accountBlobs.has(hash)) {
        continue;
      }
      if (await this.blobs.stat(userId, hash)) accountBlobs.add(hash);
    }

    for (const hash of opened.blobHashes) {
      try {
        await this.blobs.put(userId, hash, await opened.readBlob(hash));
      } catch (error) {
        if (error instanceof BlobHashMismatchError) {
          throw new DataPackageError('blob-mismatch', `附件文件 ${hash} 已损坏`);
        }
        throw error;
      }
    }

    return this.hub.writeAsHub(userId, async (batch) => {
      const target = await readTarget(batch.tx, userId, accountBlobs);
      const plan = buildImportPlan({ data, blobHashes: opened.blobHashes }, target);
      for (const write of plan.writes) {
        await batch.write(write.entity, write.id, write.fields);
      }
      if (plan.calendarSubscriptions.length > 0) {
        await batch.tx.calendarSubscription.createMany({
          data: plan.calendarSubscriptions.map((subscription) => ({ userId, ...subscription })),
        });
      }
      if (options.importPreferences && data.preferences) {
        await batch.tx.user.update({
          where: { id: userId },
          data: { preferences: data.preferences as Prisma.InputJsonValue },
        });
      }
      await batch.tx.dataImport.create({
        data: {
          userId,
          exportId: manifest.exportId,
          stats: plan.stats as unknown as Prisma.InputJsonValue,
        },
      });
      return plan.stats;
    });
  }
}

/** 导入计划需要的目标账号现状（在写入事务内读取）。 */
async function readTarget(
  tx: Prisma.TransactionClient,
  userId: string,
  blobHashes: ReadonlySet<string>,
): Promise<ImportTarget> {
  // 事务内的查询逐个执行（同一连接）
  const tags = await tx.tag.findMany({
    where: { userId },
    select: { id: true, title: true, parentId: true },
  });
  const subscriptions = await tx.calendarSubscription.findMany({
    where: { userId },
    select: { url: true },
  });
  const task = await edgePositions(tx, 'Task', userId);
  const project = await edgePositions(tx, 'Project', userId);
  const tag = await edgePositions(tx, 'Tag', userId);
  const area = await edgePositions(tx, 'Area', userId);
  const feed = await tx.$queryRawUnsafe<Array<{ key: string }>>(
    `SELECT "feedPosition" AS key FROM "Project" WHERE "userId" = $1 AND "feedPosition" IS NOT NULL ORDER BY "feedPosition" COLLATE "C" DESC LIMIT 1`,
    userId,
  );
  return {
    tags,
    lastPositions: {
      task: task.last,
      project: project.last,
      tag: tag.last,
      area: area.last,
      feed: maxKey(feed[0]?.key ?? null, project.last),
    },
    blobHashes,
    calendarUrls: new Set(subscriptions.map((row) => row.url)),
  };
}

function maxKey(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
