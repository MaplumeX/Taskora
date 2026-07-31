-- CreateTable
CREATE TABLE "ProjectHeading" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectHeading_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "headingId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectHeading_userId_idx" ON "ProjectHeading"("userId");

-- CreateIndex
CREATE INDEX "ProjectHeading_projectId_idx" ON "ProjectHeading"("projectId");

-- CreateIndex
CREATE INDEX "Task_headingId_idx" ON "Task"("headingId");

-- AddForeignKey
ALTER TABLE "ProjectHeading" ADD CONSTRAINT "ProjectHeading_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHeading" ADD CONSTRAINT "ProjectHeading_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_headingId_fkey"
FOREIGN KEY ("headingId") REFERENCES "ProjectHeading"("id") ON DELETE SET NULL ON UPDATE CASCADE;
