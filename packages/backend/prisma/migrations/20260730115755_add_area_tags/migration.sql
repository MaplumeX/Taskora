-- CreateTable
CREATE TABLE "AreaTag" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AreaTag_areaId_idx" ON "AreaTag"("areaId");

-- CreateIndex
CREATE INDEX "AreaTag_tagId_idx" ON "AreaTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "AreaTag_areaId_tagId_key" ON "AreaTag"("areaId", "tagId");

-- AddForeignKey
ALTER TABLE "AreaTag" ADD CONSTRAINT "AreaTag_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaTag" ADD CONSTRAINT "AreaTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
