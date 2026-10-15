-- MaterialSalePayment.direction: "IN" (customer collection) vs "OUT"
-- (refund paid back on a returned-but-paid sale). Defaults IN so every
-- existing row stays a collection.
ALTER TABLE "MaterialSalePayment" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'IN';
