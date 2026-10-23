-- Subcontractor PAN — the 206AA check inferred PAN presence from GSTIN
-- (chars 3-12), which marks every unregistered sub as PAN-less and applies
-- the 20% floor even when they hold a PAN. A dedicated field is also
-- mandatory for Form 26Q filings on non-GST payees.
ALTER TABLE "Subcontractor" ADD COLUMN "pan" TEXT;
