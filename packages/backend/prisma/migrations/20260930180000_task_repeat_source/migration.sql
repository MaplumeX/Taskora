-- Repeating tasks v2（recurring-tasks-v2 issue 01）：Task 增加 repeatSourceId——
-- 派生实例记录其来源重复任务的 id。派生前按它判断「已派生过」，重开来源
-- 任务不再删除实例。不设外键：来源被物理删除后字段悬空无害。
ALTER TABLE "Task" ADD COLUMN "repeatSourceId" TEXT;

CREATE INDEX "Task_repeatSourceId_idx" ON "Task"("repeatSourceId");
