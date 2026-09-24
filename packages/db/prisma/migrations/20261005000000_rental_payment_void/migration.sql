-- RentalPayment void support — status already exists; add audit fields.
ALTER TABLE "RentalPayment" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "RentalPayment" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "RentalPayment" ADD COLUMN "voidReason" TEXT;
