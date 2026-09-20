-- AlterTable
ALTER TABLE "Area" ADD COLUMN     "fieldDigests" JSONB;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "fieldDigests" JSONB;

-- AlterTable
ALTER TABLE "ProjectHeading" ADD COLUMN     "fieldDigests" JSONB;

-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN     "fieldDigests" JSONB;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "fieldDigests" JSONB;

-- AlterTable
ALTER TABLE "TagGroup" ADD COLUMN     "fieldDigests" JSONB;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "fieldDigests" JSONB;
