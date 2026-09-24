-- LandPurchasePayment void support — mirrors SupplierPayment void.
ALTER TABLE "LandPurchasePayment" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "LandPurchasePayment" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "LandPurchasePayment" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "LandPurchasePayment" ADD COLUMN "voidReason" TEXT;
CREATE INDEX "LandPurchasePayment_status_idx" ON "LandPurchasePayment"("status");
