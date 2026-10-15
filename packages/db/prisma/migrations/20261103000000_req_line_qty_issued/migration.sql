-- Requisition consumption tracking: an approved requisition authorizes at
-- most qtyRequested per line. qtyIssued accumulates per issue; cancel
-- releases it. Without the column, any qty could issue against an approval.
ALTER TABLE "MaterialRequisitionLine" ADD COLUMN "qtyIssued" DECIMAL(14,3) NOT NULL DEFAULT 0;
