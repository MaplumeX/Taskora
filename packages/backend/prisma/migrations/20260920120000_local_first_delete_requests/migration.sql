-- Compact 登记（ADR-0008）：设备发起删除 / hub GC 后登记已物理删除的
-- 实体 id；迟到的设备字段写被静默丢弃（Compact 永久获胜）。
CREATE TABLE "CompactedEntity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompactedEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompactedEntity_userId_entity_entityId_key" ON "CompactedEntity"("userId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "CompactedEntity_userId_idx" ON "CompactedEntity"("userId");

-- AddForeignKey
ALTER TABLE "CompactedEntity" ADD CONSTRAINT "CompactedEntity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
