-- Nested tags (ADR-0016, tags-things3-v2 issue 01): Tag Group retires; every
-- group becomes a top-level Tag with the same id, its members become children.
-- Frozen equivalent of Local Replica migration 10 -> 11 (engine nestTagGroups):
-- title / position / timestamps and their clocks are kept, color takes the
-- column default without a clock, member clocks rename tagGroupId -> parentId.
-- No SyncChange is written: both sides convert the same data the same way;
-- devices bootstrap once on protocol 5 to cover upgrade-order races.
-- Parity coverage lives in test/migrations.e2e-spec.ts.
BEGIN;

ALTER TABLE "Tag" ADD COLUMN "parentId" TEXT;

INSERT INTO "Tag" ("id", "title", "color", "position", "parentId", "userId", "createdAt", "updatedAt", "fieldClocks", "fieldDigests")
SELECT "id", "title", '#3B82F6', "position", NULL, "userId", "createdAt", "updatedAt", "fieldClocks", "fieldDigests"
FROM "TagGroup";

UPDATE "Tag"
SET "parentId" = "tagGroupId",
    "fieldClocks" = CASE
      WHEN "fieldClocks" ? 'tagGroupId'
        THEN ("fieldClocks" - 'tagGroupId') || jsonb_build_object('parentId', "fieldClocks" -> 'tagGroupId')
      ELSE "fieldClocks"
    END,
    "fieldDigests" = CASE
      WHEN "fieldDigests" ? 'tagGroupId'
        THEN ("fieldDigests" - 'tagGroupId') || jsonb_build_object('parentId', "fieldDigests" -> 'tagGroupId')
      ELSE "fieldDigests"
    END
WHERE "tagGroupId" IS NOT NULL OR "fieldClocks" ? 'tagGroupId' OR "fieldDigests" ? 'tagGroupId';

-- Compact registrations keep rejecting re-creation of a deleted group's id as a Tag.
INSERT INTO "CompactedEntity" ("id", "userId", "entity", "entityId", "createdAt")
SELECT gen_random_uuid()::text, "userId", 'tag', "entityId", "createdAt"
FROM "CompactedEntity" WHERE "entity" = 'tag-group'
ON CONFLICT ("userId", "entity", "entityId") DO NOTHING;
DELETE FROM "CompactedEntity" WHERE "entity" = 'tag-group';

ALTER TABLE "Tag" DROP CONSTRAINT "Tag_tagGroupId_fkey";
DROP INDEX "Tag_tagGroupId_idx";
ALTER TABLE "Tag" DROP COLUMN "tagGroupId";
DROP TABLE "TagGroup";

CREATE INDEX "Tag_parentId_idx" ON "Tag"("parentId");
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
