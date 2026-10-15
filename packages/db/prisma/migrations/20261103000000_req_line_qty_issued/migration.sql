-- Requisition consumption tracking: an approved requisition authorizes at
-- most qtyRequested per line. qtyIssued accumulates per issue; cancel
-- releases it. Without the column, any qty could issue against an approval.
ALTER TABLE "MaterialRequisitionLine" ADD COLUMN "qtyIssued" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- Backfill: pre-existing issues already consumed their requisition's
-- authorization — without this, a req approved-and-partially-issued before
-- this migration would have its full qtyRequested available again.
-- CANCELLED issues release their allocation, so they're excluded.
UPDATE "MaterialRequisitionLine" rl
SET "qtyIssued" = COALESCE((
  SELECT SUM(mil.qty)
  FROM "MaterialIssueLine" mil
  JOIN "MaterialIssue" mi ON mi.id = mil."materialIssueId"
  WHERE mi."requisitionId" = rl."requisitionId"
    AND mil."materialId" = rl."materialId"
    AND mi.status <> 'CANCELLED'
), 0);
