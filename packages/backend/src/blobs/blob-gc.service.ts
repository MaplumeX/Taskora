import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BlobStore } from './blob-store';

const GC_INTERVAL_MS = 60 * 60 * 1000;
/** 首次回收推迟到启动之后，不与启动期流量争 IO。 */
const FIRST_GC_DELAY_MS = 5 * 60 * 1000;

/**
 * 宽限期：Blob 写入后这么久仍没有任何 Attachment 引用才回收。覆盖「Blob
 * 已上传、引用它的 Attachment 行还在设备 Outbox 里」的窗口（上传队列与
 * Outbox 互不等待，ADR-0019）。重复上传同一内容会刷新写入时刻。
 */
export const BLOB_GC_GRACE_MS = 24 * 60 * 60 * 1000;

/** Blob 回收（ADR-0019）：删除没有任何 Attachment 引用、且过了宽限期的 Blob。 */
@Injectable()
export class BlobGcService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlobGcService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: BlobStore,
  ) {}

  onModuleInit(): void {
    const run = () => {
      void this.collect().catch((error) => this.logger.error('Blob 回收失败', error));
    };
    const schedule = (delay: number) => {
      this.timer = setTimeout(() => {
        run();
        schedule(GC_INTERVAL_MS);
      }, delay);
      this.timer.unref?.();
    };
    schedule(FIRST_GC_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 返回删除的 Blob 数。 */
  async collect(now: Date = new Date()): Promise<number> {
    let removed = 0;
    for (const userId of await this.store.users()) {
      const blobs = await this.store.list(userId);
      const expired = blobs.filter(
        (blob) => now.getTime() - blob.storedAt.getTime() > BLOB_GC_GRACE_MS,
      );
      if (expired.length === 0) continue;
      const referenced = new Set(
        (
          await this.prisma.attachment.findMany({
            where: { task: { userId }, blobHash: { in: expired.map((blob) => blob.hash) } },
            select: { blobHash: true },
            distinct: ['blobHash'],
          })
        ).map((row) => row.blobHash),
      );
      for (const blob of expired) {
        if (referenced.has(blob.hash)) continue;
        await this.store.remove(userId, blob.hash);
        removed += 1;
      }
    }
    return removed;
  }
}
