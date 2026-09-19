-- Projects no longer use the INBOX bucket; unscheduled projects default to ANYTIME.
ALTER TABLE "Project" ALTER COLUMN "bucket" SET DEFAULT 'ANYTIME';

UPDATE "Project" SET "bucket" = 'ANYTIME' WHERE "bucket" = 'INBOX';
