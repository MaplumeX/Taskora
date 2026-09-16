-- AlterTable
-- Approval cards show entity titles instead of raw ids; labels is an
-- id → title snapshot taken when the approval was created.
ALTER TABLE "AgentApproval" ADD COLUMN "labels" JSONB DEFAULT '{}';
