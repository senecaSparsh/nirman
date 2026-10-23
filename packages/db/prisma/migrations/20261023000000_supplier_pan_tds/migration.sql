-- Supplier tax identity + TDS defaults.
-- pan: required on Form 26Q filings and triggers the 206AA 20% floor when absent.
-- tdsSection/tdsRate: per-supplier defaults so the payment dialog can suggest
-- the deduction instead of re-typing it every time (payer still overrides).
ALTER TABLE "Supplier" ADD COLUMN "pan" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "tdsSection" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "tdsRate" DECIMAL(5,2);
