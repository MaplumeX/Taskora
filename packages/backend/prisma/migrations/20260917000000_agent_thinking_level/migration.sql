-- Reasoning toggle becomes a 4-step effort level; existing users who had
-- thinking enabled are mapped to the previous behavior ('medium').
ALTER TABLE "AgentConfig" ADD COLUMN "thinkingLevel" TEXT NOT NULL DEFAULT 'off';
UPDATE "AgentConfig" SET "thinkingLevel" = 'medium' WHERE "thinkingEnabled" = true;
ALTER TABLE "AgentConfig" DROP COLUMN "thinkingEnabled";
