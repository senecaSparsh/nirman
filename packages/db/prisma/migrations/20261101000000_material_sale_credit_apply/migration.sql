-- CREDIT_APPLIED payment pairs (IN on the target sale / OUT on the source)
-- link through this column so voiding one voids the other.
ALTER TABLE "MaterialSalePayment" ADD COLUMN "linkedPaymentId" TEXT;
