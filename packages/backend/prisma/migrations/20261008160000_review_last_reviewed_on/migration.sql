-- Review v2：Project 与 Area 增加上次回顾日（只由标记已回顾写入，空即从未回顾）。
ALTER TABLE "Project" ADD COLUMN "lastReviewedOn" TIMESTAMP(3);
ALTER TABLE "Area" ADD COLUMN "lastReviewedOn" TIMESTAMP(3);
