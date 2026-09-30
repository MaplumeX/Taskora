-- 数据增长（local-first-v3 issue 08）：
-- Logbook 归档按页读取（userId + settledAt 倒序）；Compact 登记随变更日志
-- 保留期清理（按 createdAt）。
CREATE INDEX "Task_userId_settledAt_idx" ON "Task"("userId", "settledAt");
CREATE INDEX "CompactedEntity_createdAt_idx" ON "CompactedEntity"("createdAt");
