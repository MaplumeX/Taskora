-- Repeating projects（recurring-projects spec）：Project 增加 repeatRule（规范形
-- 规则的 JSON 文本）与 repeatSourceId（派生出本项目的重复项目 id，不设外键）。
ALTER TABLE "Project" ADD COLUMN "repeatRule" TEXT;
ALTER TABLE "Project" ADD COLUMN "repeatSourceId" TEXT;

CREATE INDEX "Project_repeatSourceId_idx" ON "Project"("repeatSourceId");
