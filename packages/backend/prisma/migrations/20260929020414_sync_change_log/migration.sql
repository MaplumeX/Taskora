-- 同步变更日志（ADR-0007）：替代进程内存 ring buffer，hub 重启 / 多实例下
-- 设备仍可按 cursor 增量追平。

-- CreateTable
CREATE TABLE "SyncChange" (
    "userId" TEXT NOT NULL,
    "seq" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncChange_pkey" PRIMARY KEY ("userId","seq")
);

-- CreateTable
CREATE TABLE "SyncCounter" (
    "userId" TEXT NOT NULL,
    "seq" BIGINT NOT NULL DEFAULT 1,
    "prunedThrough" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "SyncCounter_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "SyncChange_createdAt_idx" ON "SyncChange"("createdAt");

-- AddForeignKey
ALTER TABLE "SyncChange" ADD CONSTRAINT "SyncChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCounter" ADD CONSTRAINT "SyncCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
