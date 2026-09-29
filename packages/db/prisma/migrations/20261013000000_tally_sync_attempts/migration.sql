-- Track sync attempts so a deterministically-failing entry stops churning
-- the hourly auto-retry forever (it'd grow a FAILED backlog that masks real
-- new failures). Past the cap it stays FAILED for manual attention.
ALTER TABLE "public"."TallySyncLog" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
