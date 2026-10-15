-- Drift repair: schema changes pushed without a migration.
-- StockTransfer.transferNumber (challan-style transfer numbering) and the
-- removal of the HsnGstRate trgm indexes existed in schema.prisma but no
-- migration ever shipped them.
-- DropIndex
DROP INDEX IF EXISTS "HsnGstRate_description_trgm_idx";
DROP INDEX IF EXISTS "HsnGstRate_hsnCode_trgm_idx";

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN "transferNumber" TEXT;

-- nirman:accept-risk column is brand-new → every existing row is NULL, and
-- Postgres treats NULLs as distinct — the unique index cannot collide.
CREATE UNIQUE INDEX "StockTransfer_transferNumber_key" ON "StockTransfer"("transferNumber");
