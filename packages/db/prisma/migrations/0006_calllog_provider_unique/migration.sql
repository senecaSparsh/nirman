-- Add a unique constraint on CallLog [companyId, providerCallId] to prevent
-- duplicate call logs from concurrent Twilio status callbacks (Twilio retries
-- on 5xx, and near-simultaneous state transitions like queued→ringing→
-- in-progress can race the findFirst+create upsert pattern).
--
-- providerCallId is nullable (manual calls have no provider ID). Postgres
-- allows multiple NULLs in a unique index, so manual calls are unaffected.
--
-- Step 1: dedupe existing rows. If duplicate (companyId, providerCallId)
-- pairs already exist (from the pre-constraint race window), keep the most
-- recently created row and delete older duplicates. We only consider rows
-- where providerCallId IS NOT NULL.
-- Step 2: create the unique index.

-- Dedupe: delete older duplicates, keeping the latest startedAt per
-- (companyId, providerCallId). Uses ctid for a stable row identifier
-- (cuid IDs are not guaranteed sortable by creation time).
DELETE FROM "CallLog"
WHERE "providerCallId" IS NOT NULL
  AND ctid NOT IN (
    SELECT DISTINCT ON ("companyId", "providerCallId") ctid
    FROM "CallLog"
    WHERE "providerCallId" IS NOT NULL
    ORDER BY "companyId", "providerCallId", "startedAt" DESC
  );

-- Create the unique index. CONCURRENTLY would be ideal but Prisma's
-- migrate deploy doesn't support running it inside a transaction; the
-- standard CREATE UNIQUE INDEX is fine for the expected table size.
CREATE UNIQUE INDEX "CallLog_companyId_providerCallId_key"
  ON "CallLog"("companyId", "providerCallId");
