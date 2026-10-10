-- Payroll-lock override on DailyProgressReport: an admin-approved back-dated
-- DPR files flagged `backDated` (posts labour as a next-period adjustment, not
-- a rewrite of the settled month) with a required audit `lockOverrideReason`.
ALTER TABLE "public"."DailyProgressReport" ADD COLUMN IF NOT EXISTS "backDated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."DailyProgressReport" ADD COLUMN IF NOT EXISTS "lockOverrideReason" TEXT;

-- WO advance write-off: tracks advance forgiven (never recovered) so the
-- outstanding formula (advanceAmount − recovered − writtenOff) resolves.
ALTER TABLE "public"."SubcontractorWorkOrder" ADD COLUMN IF NOT EXISTS "advanceWrittenOff" DECIMAL(14,2) NOT NULL DEFAULT 0;
