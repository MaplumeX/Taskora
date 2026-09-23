-- Reminders（reminders spec）：Task 增加 reminderTime 列——
-- 提醒时刻（HH:mm，本地时区语义），依附于计划日期，由客户端本地触发
-- 系统通知；hub 只参与字段级 LWW 同步，不参与触发。
ALTER TABLE "Task" ADD COLUMN "reminderTime" TEXT;
