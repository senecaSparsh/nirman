-- UserPreference: per-user, per-company UI customization store.
-- A generic key→JSON table so future prefs (theme, density, list column
-- order, etc.) reuse it without schema changes. Currently powers the
-- editable/movable persona-aware quick-action bar on the mobile
-- Inventory / HR / Accounts home pages.
--
-- Key convention: "<feature>:<module>:<tab>" e.g.
--   "quick-actions:inventory:raw-material"
-- Value: feature-specific JSON (for quick-actions: string[] of action
--   keys in display order).

CREATE TABLE "UserPreference" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "value"     JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- One value per (user, company, key) — upserts use this.
CREATE UNIQUE INDEX "UserPreference_userId_companyId_key_key"
    ON "UserPreference"("userId", "companyId", "key");

-- FKs: cascade on user/company delete so prefs are cleaned up with the
-- owning row. Matches the onDelete: Cascade declared in the schema.
ALTER TABLE "UserPreference"
    ADD CONSTRAINT "UserPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPreference"
    ADD CONSTRAINT "UserPreference_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UserPreference_companyId_idx" ON "UserPreference"("companyId");
