-- 26AS reconciliation flag — the CA marks when a buyer-withheld 194-IA
-- amount appears in Form 26AS, closing the TDS_RECEIVABLE loop.
ALTER TABLE "AssetSale" ADD COLUMN IF NOT EXISTS "tdsReconciledAt" TIMESTAMP(3);
