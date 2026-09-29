-- Additive — a reused idempotency key with a different payload must not
-- silently replay the first response (the caller's real data is lost while
-- looking successful). Store a sha256 of the request body so a mismatch can
-- be detected and rejected with 422.
ALTER TABLE "public"."IdempotencyKey" ADD COLUMN IF NOT EXISTS "requestHash" TEXT;
