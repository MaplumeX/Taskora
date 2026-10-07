-- Task 附件（ADR-0019）：Attachment 只存元数据，文件内容是按 blobHash
-- （sha256）寻址的 Blob，存在 BlobStore 里。随父 Task 级联删除。
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "blobHash" TEXT NOT NULL,
    "position" TEXT,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fieldClocks" JSONB,
    "fieldDigests" JSONB,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");
CREATE INDEX "Attachment_blobHash_idx" ON "Attachment"("blobHash");

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
