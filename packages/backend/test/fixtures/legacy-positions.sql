-- Synthetic, non-sensitive fixture for v0.7.1 / v0.7.2 (before Position expand).
-- The same fixture is exercised against the release schemas in image smoke CI.
INSERT INTO "User" (id, email, "passwordHash", "updatedAt")
VALUES ('upgrade-user', 'upgrade@example.test', 'not-a-password', TIMESTAMP '2026-10-01 00:00:00');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Area', 'Project', 'TagGroup', 'Tag', 'Task'] LOOP
    EXECUTE format(
      'INSERT INTO %I (id, title, "userId", "sortOrder", "createdAt", "updatedAt", "fieldClocks")
       SELECT $1 || i, ''legacy'', ''upgrade-user'', CASE WHEN i = 0 THEN 0 ELSE 61 END,
       TIMESTAMP ''2026-10-01 00:00:00'' + i * INTERVAL ''1 millisecond'',
       TIMESTAMP ''2026-10-01 00:00:00'', ''{"title":"1800000000000:0:device"}''::jsonb
       FROM generate_series(0, 2) i', t) USING t;
  END LOOP;
END $$;
INSERT INTO "ProjectHeading" (id, title, "userId", "projectId", "sortOrder", "createdAt", "updatedAt")
SELECT 'ProjectHeading' || i, 'heading', 'upgrade-user', 'Project0', i,
       TIMESTAMP '2026-10-01 00:00:00', TIMESTAMP '2026-10-01 00:00:00'
FROM generate_series(0, 2) i;
INSERT INTO "Subtask" (id, title, "taskId", "sortOrder", "createdAt", "updatedAt")
SELECT 'Subtask' || i, 'subtask', 'Task0', i,
       TIMESTAMP '2026-10-01 00:00:00', TIMESTAMP '2026-10-01 00:00:00'
FROM generate_series(0, 2) i;
-- These represent device reorders; the retired integer must not override them.
UPDATE "Task" SET position = 'Zz' WHERE id = 'Task2';
UPDATE "Project" SET position = 'a0V' WHERE id = 'Project2';
UPDATE "Tag" SET position = 'a1' WHERE id = 'Tag2';
INSERT INTO "SyncCounter" ("userId", seq, "prunedThrough") VALUES ('upgrade-user', 1, 0);
INSERT INTO "SyncChange" ("userId", seq, payload)
VALUES ('upgrade-user', 1, '{"fixture":true}');
