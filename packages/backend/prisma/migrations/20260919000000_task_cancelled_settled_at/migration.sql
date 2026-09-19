-- Task Cancelled 终态（spec: task-cancelled）：
-- 1) TaskStatus 增加 CANCELLED（与 ACTIVE/COMPLETED 同级的第二种终态）
-- 2) Task/Subtask 的 completedAt 列改名为 settledAt（了结时间单一列，
--    status 表达"怎么了的结"，见 ADR 0006）。用 RENAME 保留既有数据：
--    COMPLETED 行的 settledAt 即原完成时间，语义不变。

ALTER TYPE "TaskStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "Task" RENAME COLUMN "completedAt" TO "settledAt";

ALTER TABLE "Subtask" RENAME COLUMN "completedAt" TO "settledAt";
