-- Occurrence Date（出现日，recurring-tasks-v4）：Task 与 Project 记录重复链上这一环原定的日期；存量为空。
ALTER TABLE "Task" ADD COLUMN "occurrenceDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "occurrenceDate" TIMESTAMP(3);
