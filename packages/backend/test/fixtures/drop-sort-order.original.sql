-- 退役 sortOrder（retire-sort-order issue 05）：协议 4 起不上 wire，列表只按 position 排。
-- 前提：协议 4 的 hub 已部署并完成启动物化（legacy-position-backfill），没有旧 hub 实例在跑。
-- 仍有空 position 的行说明物化没跑过：删列会丢掉它们唯一的排序信息，宁可让迁移失败。
DO $$
DECLARE
  t text;
  missing bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['Task', 'Subtask', 'Project', 'ProjectHeading', 'Area', 'Tag', 'TagGroup'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "position" IS NULL', t) INTO missing;
    IF missing > 0 THEN
      RAISE EXCEPTION '% 有 % 行 position 为空：先部署协议 4 的 hub 完成启动物化，再删 sortOrder', t, missing;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "Task" DROP COLUMN "sortOrder";
ALTER TABLE "Subtask" DROP COLUMN "sortOrder";
ALTER TABLE "Project" DROP COLUMN "sortOrder";
ALTER TABLE "ProjectHeading" DROP COLUMN "sortOrder";
ALTER TABLE "Area" DROP COLUMN "sortOrder";
ALTER TABLE "Tag" DROP COLUMN "sortOrder";
ALTER TABLE "TagGroup" DROP COLUMN "sortOrder";
