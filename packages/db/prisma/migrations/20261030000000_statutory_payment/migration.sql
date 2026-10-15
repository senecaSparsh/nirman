-- StatutoryPayment — remittance doc for PF/ESI/TDS/GST liabilities.
-- Gives the accumulated statutory payables (2250/2350/2400 + net GST) a
-- real settlement path; the GL legs post under sourceType
-- STATUTORY_PAYMENT and void reverses them.
CREATE TABLE "StatutoryPayment" (
  "id"            TEXT           NOT NULL,
  "companyId"     TEXT           NOT NULL,
  "kind"          TEXT           NOT NULL,
  "amount"        NUMERIC(14,2)  NOT NULL,
  "itcUtilized"   NUMERIC(14,2)  NOT NULL DEFAULT 0,
  "period"        TEXT,
  "paymentDate"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referenceNo"   TEXT,
  "notes"         TEXT,
  "status"        TEXT           NOT NULL DEFAULT 'POSTED',
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "StatutoryPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StatutoryPayment_companyId_kind_idx" ON "StatutoryPayment"("companyId", "kind");
CREATE INDEX "StatutoryPayment_companyId_status_idx" ON "StatutoryPayment"("companyId", "status");
