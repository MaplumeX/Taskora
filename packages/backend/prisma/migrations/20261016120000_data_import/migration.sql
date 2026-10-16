-- 数据包导入记录（.scratch/data-import）：按 exportId 提示「已导入过」。
-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stats" JSONB NOT NULL,

    CONSTRAINT "DataImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataImport_userId_exportId_idx" ON "DataImport"("userId", "exportId");

-- AddForeignKey
ALTER TABLE "DataImport" ADD CONSTRAINT "DataImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

