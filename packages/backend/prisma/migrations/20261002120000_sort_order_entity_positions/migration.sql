-- Position：Area / ProjectHeading / TagGroup / Subtask 的排序位次（retire-sort-order issue 02）
ALTER TABLE "Area" ADD COLUMN "position" TEXT;
ALTER TABLE "ProjectHeading" ADD COLUMN "position" TEXT;
ALTER TABLE "TagGroup" ADD COLUMN "position" TEXT;
ALTER TABLE "Subtask" ADD COLUMN "position" TEXT;
