-- Rename old dueDate (计划日期) to scheduledDate, preserving data
ALTER TABLE "Task" RENAME COLUMN "dueDate" TO "scheduledDate";

-- Add new dueDate (通知日期) as nullable, default null for all rows
ALTER TABLE "Task" ADD COLUMN "dueDate" TIMESTAMP(3);