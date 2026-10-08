-- Review（回顾）：Project 与 Area 增加回顾间隔（{ unit, count } 的 JSON 文本）
-- 与下次回顾日。存量行留空：空的下次回顾日即今天待回顾，空间隔按账号默认。
ALTER TABLE "Project" ADD COLUMN "reviewInterval" TEXT;
ALTER TABLE "Project" ADD COLUMN "nextReviewDate" TIMESTAMP(3);
ALTER TABLE "Area" ADD COLUMN "reviewInterval" TEXT;
ALTER TABLE "Area" ADD COLUMN "nextReviewDate" TIMESTAMP(3);
