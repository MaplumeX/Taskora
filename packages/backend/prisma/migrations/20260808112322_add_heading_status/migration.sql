-- CreateEnum
CREATE TYPE "HeadingStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "ProjectHeading" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "status" "HeadingStatus" NOT NULL DEFAULT 'ACTIVE';
