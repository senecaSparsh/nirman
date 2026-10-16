-- Link a reversal journal entry to the exact entry it reverses — doc-level
-- sourceId can't dedupe when one document carries several JEs (e.g. revenue +
-- COGS legs), so the link must live on the entry itself.
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;
