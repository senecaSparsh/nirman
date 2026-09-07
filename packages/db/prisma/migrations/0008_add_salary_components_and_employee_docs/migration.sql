-- 0008: Add ContractStatus enum, Employee contract/offer-letter/ID-card
-- tracking columns, and SalaryComponent model.
--
-- This migration adds:
--   1. ContractStatus enum (if not already present from a prior db push)
--   2. Employee contract columns (contractStatus, contractIssuedAt,
--      contractConfirmedAt, contractAttachmentId) — if not already present
--   3. Two new enums: SalaryComponentType, ComponentFrequency
--   4. A new SalaryComponent table (CTC breakdown per employee)
--   5. Six new columns on Employee for offer-letter and ID-card tracking
--   6. Indexes on Employee (contractStatus, offerLetterStatus, idCardStatus)
--
-- All additive — no existing columns or tables are modified or dropped.
-- Uses IF NOT EXISTS guards so it's safe even if some objects were already
-- created by a prior `db push` in development.

-- ── 1. ContractStatus enum ────────────────────────────────────
-- Created here because it was added to the schema but never had a migration.
-- The DO block checks if the type exists before creating it.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractStatus') THEN
    CREATE TYPE "ContractStatus" AS ENUM (
      'DRAFT',
      'ISSUED',
      'CONFIRMED',
      'EXPIRED',
      'TERMINATED'
    );
  END IF;
END
$$;

-- ── 2. Employee: contract tracking columns ────────────────────
-- These were in the schema but never migrated. Add them if missing.

ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS "contractStatus"        "ContractStatus",
    ADD COLUMN IF NOT EXISTS "contractIssuedAt"      TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "contractConfirmedAt"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "contractAttachmentId"  TEXT;

-- ── 3. New enums for SalaryComponent ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalaryComponentType') THEN
    CREATE TYPE "SalaryComponentType" AS ENUM (
      'BASIC',
      'HRA',
      'DA',
      'TA',
      'SPECIAL_ALLOWANCE',
      'FOOD_ALLOWANCE',
      'MEDICAL_ALLOWANCE',
      'UNIFORM_ALLOWANCE',
      'WASHING_ALLOWANCE',
      'LTA',
      'PERFORMANCE_BONUS',
      'JOINING_BONUS',
      'RETENTION_BONUS',
      'EMPLOYER_PF',
      'EMPLOYEE_PF',
      'EMPLOYER_ESI',
      'EMPLOYEE_ESI',
      'GRATUITY',
      'PROFESSION_TAX',
      'TDS',
      'OTHER'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ComponentFrequency') THEN
    CREATE TYPE "ComponentFrequency" AS ENUM (
      'MONTHLY',
      'QUARTERLY',
      'HALF_YEARLY',
      'YEARLY',
      'ONE_TIME'
    );
  END IF;
END
$$;

-- ── 4. SalaryComponent table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS "SalaryComponent" (
    "id"               TEXT NOT NULL,
    "employeeId"       TEXT NOT NULL,
    "type"             "SalaryComponentType" NOT NULL,
    "amount"           DECIMAL(14,2) NOT NULL,
    "frequency"        "ComponentFrequency" NOT NULL DEFAULT 'MONTHLY',
    "isDeduction"      BOOLEAN NOT NULL DEFAULT false,
    "isPercentage"     BOOLEAN NOT NULL DEFAULT false,
    "percentageOfBasic" DECIMAL(5,2),
    "notes"            TEXT,
    "active"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalaryComponent_employeeId_idx" ON "SalaryComponent"("employeeId");
CREATE INDEX IF NOT EXISTS "SalaryComponent_type_idx" ON "SalaryComponent"("type");

-- One component per type per employee (prevents duplicate BASIC rows, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryComponent_employeeId_type_key"
    ON "SalaryComponent"("employeeId", "type");

-- Only add the FK if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalaryComponent_employeeId_fkey'
  ) THEN
    ALTER TABLE "SalaryComponent"
        ADD CONSTRAINT "SalaryComponent_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ── 5. Employee: offer-letter + ID-card tracking columns ──────
-- All nullable so existing employee rows are unaffected.

ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS "offerLetterStatus"        "ContractStatus",
    ADD COLUMN IF NOT EXISTS "offerLetterIssuedAt"      TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "offerLetterAttachmentId"  TEXT,
    ADD COLUMN IF NOT EXISTS "idCardStatus"             "ContractStatus",
    ADD COLUMN IF NOT EXISTS "idCardIssuedAt"           TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "idCardAttachmentId"       TEXT;

-- ── 6. Indexes for the status columns ─────────────────────────

CREATE INDEX IF NOT EXISTS "Employee_contractStatus_idx" ON "Employee"("contractStatus");
CREATE INDEX IF NOT EXISTS "Employee_offerLetterStatus_idx" ON "Employee"("offerLetterStatus");
CREATE INDEX IF NOT EXISTS "Employee_idCardStatus_idx" ON "Employee"("idCardStatus");
