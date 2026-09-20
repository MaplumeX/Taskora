-- AlterTable
ALTER TABLE "Area" ADD COLUMN     "fieldClocks" JSONB;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "fieldClocks" JSONB,
ADD COLUMN     "position" TEXT;

-- AlterTable
ALTER TABLE "ProjectHeading" ADD COLUMN     "fieldClocks" JSONB;

-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN     "fieldClocks" JSONB;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "fieldClocks" JSONB,
ADD COLUMN     "position" TEXT;

-- AlterTable
ALTER TABLE "TagGroup" ADD COLUMN     "fieldClocks" JSONB;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "fieldClocks" JSONB,
ADD COLUMN     "position" TEXT;

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_deviceId_key" ON "Device"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
