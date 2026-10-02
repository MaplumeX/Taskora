-- Repair of the released contract migration (retire-sort-order issue 06).
-- Original SHA-256: 88b8e90e25caed20e687f04e20645e4cb1758fdc67d568fcc1415becc9a0a134
-- Upgrades may skip the intermediate hub's startup hook. Materialize here before
-- dropping the only legacy ordering input. Already-applied migrations stay applied.
-- Frozen equivalent of Engine synthPosition / replica migration 7 -> 8; parity
-- coverage lives in test/migrations.e2e-spec.ts. Do not use current reorder rules.
BEGIN;

CREATE FUNCTION pg_temp.taskora_legacy_position(sort_order integer, created_at timestamp)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  remaining bigint := GREATEST(0, sort_order);
  width integer := 1;
  capacity bigint := 62;
  integer_digits text := '';
  descending bigint := GREATEST(0, 4102444800000 - (EXTRACT(EPOCH FROM created_at) * 1000)::bigint);
  fraction text := '';
BEGIN
  -- nth append key: a0..az, b00..bzz, c000..czzz, ... (O(log n)).
  WHILE remaining >= capacity LOOP
    remaining := remaining - capacity;
    capacity := capacity * 62;
    width := width + 1;
  END LOOP;
  FOR i IN 1..width LOOP
    integer_digits := substr(digits, (remaining % 62)::integer + 1, 1) || integer_digits;
    remaining := remaining / 62;
  END LOOP;
  LOOP
    fraction := substr(digits, (descending % 62)::integer + 1, 1) || fraction;
    descending := descending / 62;
    EXIT WHEN descending = 0;
  END LOOP;
  -- JS padStart never truncates. PostgreSQL lpad does, so preserve longer values.
  RETURN chr(ascii('a') + width - 1) || integer_digits
    || repeat('0', GREATEST(0, 9 - length(fraction))) || fraction || '1';
END $$;

DO $$
DECLARE
  t text;
  missing bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['Task', 'Subtask', 'Project', 'ProjectHeading', 'Area', 'Tag', 'TagGroup'] LOOP
    EXECUTE format(
      'UPDATE %I SET "position" = pg_temp.taskora_legacy_position("sortOrder", "createdAt") WHERE "position" IS NULL', t);
    EXECUTE format('SELECT count(*) FROM %I WHERE "position" IS NULL', t) INTO missing;
    IF missing > 0 THEN
      RAISE EXCEPTION '% still has % null positions after legacy backfill', t, missing;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "Task" DROP COLUMN "sortOrder";
ALTER TABLE "Subtask" DROP COLUMN "sortOrder";
ALTER TABLE "Project" DROP COLUMN "sortOrder";
ALTER TABLE "ProjectHeading" DROP COLUMN "sortOrder";
ALTER TABLE "Area" DROP COLUMN "sortOrder";
ALTER TABLE "Tag" DROP COLUMN "sortOrder";
ALTER TABLE "TagGroup" DROP COLUMN "sortOrder";

DROP FUNCTION pg_temp.taskora_legacy_position(integer, timestamp);
COMMIT;
