-- Repeating tasks（recurring-tasks spec）：Task 增加 repeatRule 列——
-- 规范形规则对象的 JSON 文本。hub 只按字段级 LWW 同步该列，不解析规则；
-- 派生（含 REST 完成路径的服务端派生）复用 @taskora/engine 的纯函数，
-- 与设备侧派生产出同一确定性 id。
ALTER TABLE "Task" ADD COLUMN "repeatRule" TEXT;
