-- SupplierPayment void support — a mis-entered payment is voided (never
-- deleted) so the audit trail survives.
ALTER TABLE "SupplierPayment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "SupplierPayment" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "SupplierPayment" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "SupplierPayment" ADD COLUMN "voidReason" TEXT;
CREATE INDEX "SupplierPayment_status_idx" ON "SupplierPayment"("status");
