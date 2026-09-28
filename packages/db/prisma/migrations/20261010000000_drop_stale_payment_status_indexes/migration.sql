-- Reconcile drift: these indexes exist in the DB (created by earlier
-- migrations) but the @@index([status]) was removed from the models without a
-- drop migration. Dropping them keeps migrations == schema.prisma.
DROP INDEX IF EXISTS "LandPurchasePayment_status_idx";
DROP INDEX IF EXISTS "MaterialSalePayment_status_idx";
DROP INDEX IF EXISTS "SupplierPayment_status_idx";
