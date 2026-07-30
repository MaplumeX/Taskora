-- 1. Backfill trashedAt for rows currently in TRASHED status
UPDATE "Task" SET "trashedAt" = COALESCE("trashedAt", NOW()) WHERE "status" = 'TRASHED';
UPDATE "Project" SET "trashedAt" = COALESCE("trashedAt", NOW()) WHERE "status" = 'TRASHED';

-- 2. Reset status to ACTIVE for those rows
UPDATE "Task" SET "status" = 'ACTIVE' WHERE "status" = 'TRASHED';
UPDATE "Project" SET "status" = 'ACTIVE' WHERE "status" = 'TRASHED';

-- 3. Remove TRASHED value from TaskStatus enum
CREATE TYPE "TaskStatus_new" AS ENUM ('ACTIVE', 'COMPLETED');
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus_new" USING "status"::text::"TaskStatus_new";
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "TaskStatus";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";

-- 4. Remove TRASHED value from ProjectStatus enum
CREATE TYPE "ProjectStatus_new" AS ENUM ('ACTIVE', 'COMPLETED');
ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "status" TYPE "ProjectStatus_new" USING "status"::text::"ProjectStatus_new";
ALTER TABLE "Project" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "ProjectStatus";
ALTER TYPE "ProjectStatus_new" RENAME TO "ProjectStatus";
