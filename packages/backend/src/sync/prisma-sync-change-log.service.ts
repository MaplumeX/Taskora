import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { HubChange } from '@taskora/engine';

import { PrismaService } from '../prisma/prisma.service';
import {
  SYNC_LOG_RETENTION_DAYS,
  SYNC_PULL_PAGE_SIZE,
  SyncChangeLog,
  type HubChangeDraft,
  type SyncPullResult,
} from './sync-change-log';

type RawClient = {
  $queryRaw<T>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<number>;
};

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
/** 首次清理推迟到启动之后，不与启动期流量（和测试的建表/清表）争锁。 */
const FIRST_PRUNE_DELAY_MS = 60 * 1000;

/**
 * Postgres 持久化的同步变更日志（替代进程内存 ring buffer）。
 *
 * - hub 重启 / 发版后设备按 cursor 增量追平，不再全体 bootstrap；
 * - 多实例部署共享同一日志；
 * - seq 由每用户一行的 SyncCounter 分配：UPSERT ... RETURNING 持有该行
 *   的行锁直到调用方事务提交，同一用户的并发写入因此按 seq 顺序提交，
 *   读者不会先看到 seq 11 再看到 10（否则 cursor 越过 10 后永久漏掉）。
 * - 保留 SYNC_LOG_RETENTION_DAYS 天，按小时清理；被清理的最大 seq 记入
 *   prunedThrough，更早的 cursor 走 resync。
 * - Compact 登记（CompactedEntity）与它的 Compact Event 同期清理
 *   （local-first-v3 issue 08）：还没拉到这条 Compact Event 的设备，此后
 *   的 cursor 都早于 prunedThrough，会先 bootstrap。登记与事件在同一个
 *   事务里写入，createdAt 相同，按同一阈值删除即同期。
 */
@Injectable()
export class PrismaSyncChangeLog extends SyncChangeLog implements OnModuleInit, OnModuleDestroy {
  private pruneTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  onModuleInit(): void {
    const run = () => {
      void this.prune().catch((error) => console.error('[sync-log] 清理失败', error));
    };
    const schedule = (delayMs: number) => {
      this.pruneTimer = setTimeout(() => {
        run();
        schedule(PRUNE_INTERVAL_MS);
      }, delayMs);
      this.pruneTimer.unref?.();
    };
    schedule(FIRST_PRUNE_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.pruneTimer) clearTimeout(this.pruneTimer);
    this.pruneTimer = null;
  }

  async append(tx: unknown, userId: string, changes: HubChangeDraft[]): Promise<void> {
    if (changes.length === 0) return;
    const client = tx as RawClient;
    const count = changes.length;
    const rows = await client.$queryRaw<Array<{ seq: bigint }>>`
      INSERT INTO "SyncCounter" ("userId", "seq", "prunedThrough")
      VALUES (${userId}, ${1 + count}, 1)
      ON CONFLICT ("userId") DO UPDATE SET "seq" = "SyncCounter"."seq" + ${count}
      RETURNING "seq"`;
    const first = Number(rows[0].seq) - count + 1;
    const values = changes.map(
      (change, index) =>
        Prisma.sql`(${userId}, ${first + index}, ${JSON.stringify(change)}::jsonb)`,
    );
    await client.$executeRaw`
      INSERT INTO "SyncChange" ("userId", "seq", "payload")
      VALUES ${Prisma.join(values)}`;
  }

  async pull(userId: string, cursor: number): Promise<SyncPullResult> {
    // 同一快照里读 counter 与日志：清理与写入不会让两者互相矛盾
    return this.prisma.rawTransaction(
      async (tx) => {
        const { seq: current, prunedThrough } = await this.readCounter(tx, userId);
        if (cursor > current || cursor < prunedThrough) {
          return { changes: [], cursor: current, resync: true, hasMore: false };
        }
        const rows = await tx.syncChange.findMany({
          where: { userId, seq: { gt: cursor } },
          orderBy: { seq: 'asc' },
          take: SYNC_PULL_PAGE_SIZE + 1,
          select: { seq: true, payload: true },
        });
        const page = rows.slice(0, SYNC_PULL_PAGE_SIZE);
        const changes = page.map(
          (row) => ({ ...(row.payload as object), seq: Number(row.seq) }) as HubChange,
        );
        return {
          changes,
          cursor: page.length > 0 ? Number(page[page.length - 1].seq) : current,
          resync: false,
          hasMore: rows.length > SYNC_PULL_PAGE_SIZE,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async currentSeq(userId: string): Promise<number> {
    return (await this.readCounter(this.prisma, userId)).seq;
  }

  /** 清理超出保留期的日志与 Compact 登记，并推进各用户的 prunedThrough。 */
  async prune(now: Date = new Date()): Promise<void> {
    const threshold = new Date(now.getTime() - SYNC_LOG_RETENTION_DAYS * 24 * 3600 * 1000);
    await this.prisma.rawTransaction(async (tx) => {
      await tx.$executeRaw`
      WITH deleted AS (
        DELETE FROM "SyncChange" WHERE "createdAt" < ${threshold} RETURNING "userId", "seq"
      ), maxima AS (
        SELECT "userId", MAX("seq") AS "maxSeq" FROM deleted GROUP BY "userId"
      )
      UPDATE "SyncCounter" AS c
      SET "prunedThrough" = GREATEST(c."prunedThrough", maxima."maxSeq")
      FROM maxima WHERE c."userId" = maxima."userId"`;
      await tx.$executeRaw`DELETE FROM "CompactedEntity" WHERE "createdAt" < ${threshold}`;
    });
  }

  /** 未写过日志的用户视为 seq = prunedThrough = 1。 */
  private async readCounter(
    client: unknown,
    userId: string,
  ): Promise<{ seq: number; prunedThrough: number }> {
    const counter = await (client as PrismaService).syncCounter.findUnique({
      where: { userId },
      select: { seq: true, prunedThrough: true },
    });
    return counter
      ? { seq: Number(counter.seq), prunedThrough: Number(counter.prunedThrough) }
      : { seq: 1, prunedThrough: 1 };
  }
}
