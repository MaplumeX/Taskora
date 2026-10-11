-- Start model (ADR 0024, things3-start-model issue 01): Task / Project bucket
-- and scheduledType merge into one "start" (INBOX / ANYTIME / SOMEDAY) next to
-- scheduledDate, as in the Things 3 database.
-- Frozen equivalent of Local Replica migration 14 -> 15 (engine
-- mergeBucketIntoStart):
--   SOMEDAY -> SOMEDAY; DATE -> ANYTIME; NONE -> INBOX only for a task whose
--   bucket was INBOX and that has no project and no area, otherwise ANYTIME;
--   projects -> ANYTIME unless SOMEDAY. Rows that were not DATE lose any
--   leftover scheduledDate. The start clock is the greater of the bucket and
--   scheduledType clocks (canonical HLC strings compare lexicographically);
--   both old keys leave fieldClocks and fieldDigests.
-- No SyncChange is written: both sides convert the same data the same way;
-- devices bootstrap once on protocol 7 to cover upgrade-order races.
BEGIN;

CREATE TYPE "Start" AS ENUM ('INBOX', 'ANYTIME', 'SOMEDAY');

ALTER TABLE "Task" ADD COLUMN "start" "Start" NOT NULL DEFAULT 'INBOX';
ALTER TABLE "Project" ADD COLUMN "start" "Start" NOT NULL DEFAULT 'ANYTIME';

UPDATE "Task"
SET "start" = (CASE
      WHEN "scheduledType" = 'SOMEDAY' THEN 'SOMEDAY'
      WHEN "scheduledType" = 'DATE' THEN 'ANYTIME'
      WHEN "bucket" = 'INBOX' AND "projectId" IS NULL AND "areaId" IS NULL THEN 'INBOX'
      ELSE 'ANYTIME'
    END)::"Start",
    "scheduledDate" = CASE WHEN "scheduledType" = 'DATE' THEN "scheduledDate" ELSE NULL END,
    "fieldClocks" = CASE
      WHEN "fieldClocks" IS NULL THEN NULL
      WHEN GREATEST("fieldClocks" ->> 'bucket', "fieldClocks" ->> 'scheduledType') IS NULL
        THEN "fieldClocks" - 'bucket' - 'scheduledType'
      ELSE ("fieldClocks" - 'bucket' - 'scheduledType') || jsonb_build_object(
        'start', GREATEST("fieldClocks" ->> 'bucket', "fieldClocks" ->> 'scheduledType')
      )
    END,
    "fieldDigests" = CASE
      WHEN "fieldDigests" IS NULL THEN NULL
      ELSE "fieldDigests" - 'bucket' - 'scheduledType'
    END;

UPDATE "Project"
SET "start" = (CASE WHEN "scheduledType" = 'SOMEDAY' THEN 'SOMEDAY' ELSE 'ANYTIME' END)::"Start",
    "scheduledDate" = CASE WHEN "scheduledType" = 'DATE' THEN "scheduledDate" ELSE NULL END,
    "fieldClocks" = CASE
      WHEN "fieldClocks" IS NULL THEN NULL
      WHEN GREATEST("fieldClocks" ->> 'bucket', "fieldClocks" ->> 'scheduledType') IS NULL
        THEN "fieldClocks" - 'bucket' - 'scheduledType'
      ELSE ("fieldClocks" - 'bucket' - 'scheduledType') || jsonb_build_object(
        'start', GREATEST("fieldClocks" ->> 'bucket', "fieldClocks" ->> 'scheduledType')
      )
    END,
    "fieldDigests" = CASE
      WHEN "fieldDigests" IS NULL THEN NULL
      ELSE "fieldDigests" - 'bucket' - 'scheduledType'
    END;

ALTER TABLE "Task" DROP COLUMN "bucket";
ALTER TABLE "Task" DROP COLUMN "scheduledType";
ALTER TABLE "Project" DROP COLUMN "bucket";
ALTER TABLE "Project" DROP COLUMN "scheduledType";

DROP TYPE "TaskBucket";
DROP TYPE "ProjectBucket";
DROP TYPE "ScheduledType";

COMMIT;
