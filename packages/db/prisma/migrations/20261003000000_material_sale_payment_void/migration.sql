-- MaterialSalePayment void support — mirrors SupplierPayment void.
ALTER TABLE "MaterialSalePayment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE "MaterialSalePayment" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "MaterialSalePayment" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "MaterialSalePayment" ADD COLUMN "voidReason" TEXT;
CREATE INDEX "MaterialSalePayment_status_idx" ON "MaterialSalePayment"("status");
