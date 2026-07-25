-- CreateEnum
CREATE TYPE "ScheduledType" AS ENUM ('NONE', 'DATE', 'SOMEDAY');

-- AlterTable: add scheduledType column
ALTER TABLE "Task" ADD COLUMN "scheduledType" "ScheduledType" NOT NULL DEFAULT 'NONE';

-- Recreate TaskBucket without SOMEDAY value
CREATE TYPE "TaskBucket_new" AS ENUM ('INBOX', 'ANYTIME', 'SCHEDULED');

ALTER TABLE "Task" ALTER COLUMN "bucket" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "bucket" TYPE "TaskBucket_new" USING "bucket"::text::"TaskBucket_new";
ALTER TABLE "Task" ALTER COLUMN "bucket" SET DEFAULT 'INBOX';

DROP TYPE "TaskBucket";
ALTER TYPE "TaskBucket_new" RENAME TO "TaskBucket";