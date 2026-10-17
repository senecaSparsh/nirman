-- consistency-audit.sql — differential truth-vs-materialized audit.
--
-- Recomputes derived state from the append-only event tables and diffs
-- it against the materialized rows. Any drift = a write path that
-- updated one side without the other (the class endpoint tests miss).
--
-- IN  movements (toLocation): PURCHASE_RECEIPT, TRANSFER_IN,
--     ADJUSTMENT_IN, SCRAP_GENERATED, OPENING_BALANCE
-- OUT movements (fromLocation): ISSUE_TO_PROJECT, ISSUE_TO_DEPARTMENT,
--     ADJUSTMENT_OUT, TRANSFER_OUT, SALE, RETURN
--
-- Usage: psql $DATABASE_URL -f scripts/consistency-audit.sql

\set ON_ERROR_STOP off

\echo '═══════════════════════════════════════════════════════'
\echo ' 1. StockLocationItem.qty vs recomputed StockMovement sum'
\echo '═══════════════════════════════════════════════════════'

WITH recomputed AS (
  SELECT
    COALESCE(inn."toLocationId", outt."fromLocationId") AS "locationId",
    COALESCE(inn."materialId", outt."materialId") AS "materialId",
    COALESCE(inn.in_qty, 0) - COALESCE(outt.out_qty, 0) AS qty
  FROM (
    SELECT "toLocationId", "materialId", SUM(qty) AS in_qty
    FROM "StockMovement"
    WHERE "movementType" IN ('PURCHASE_RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','SCRAP_GENERATED','OPENING_BALANCE')
    GROUP BY 1, 2
  ) inn
  FULL JOIN (
    SELECT "fromLocationId", "materialId", SUM(qty) AS out_qty
    FROM "StockMovement"
    WHERE "movementType" IN ('ISSUE_TO_PROJECT','ISSUE_TO_DEPARTMENT','ADJUSTMENT_OUT','TRANSFER_OUT','SALE','RETURN')
    GROUP BY 1, 2
  ) outt ON inn."toLocationId" = outt."fromLocationId" AND inn."materialId" = outt."materialId"
)
SELECT
  i.id, i."locationId", i."materialId", i.qty AS materialized,
  COALESCE(r.qty, 0) AS recomputed,
  (i.qty - COALESCE(r.qty, 0)) AS drift
FROM "StockLocationItem" i
JOIN recomputed r ON r."locationId" = i."locationId" AND r."materialId" = i."materialId"
WHERE i.qty <> COALESCE(r.qty, 0)
ORDER BY ABS(i.qty - COALESCE(r.qty, 0)) DESC
LIMIT 20;

-- materialized rows with NO movement history at all (pure phantom stock)
SELECT 'phantom-stock', i.id, i."locationId", i."materialId", i.qty
FROM "StockLocationItem" i
WHERE NOT EXISTS (
  SELECT 1 FROM "StockMovement" m
  WHERE (m."toLocationId" = i."locationId" OR m."fromLocationId" = i."locationId")
    AND m."materialId" = i."materialId"
)
LIMIT 20;

\echo '═══════════════════════════════════════════════════════'
\echo ' 2. Negative stock (materialized qty < 0)'
\echo '═══════════════════════════════════════════════════════'
SELECT id, "locationId", "materialId", qty FROM "StockLocationItem" WHERE qty < 0 LIMIT 20;

\echo '═══════════════════════════════════════════════════════'
\echo ' 3. JournalEntry balance — debits must equal credits'
\echo '═══════════════════════════════════════════════════════'
SELECT e.id, e."entryDate",
  SUM(l.debit) AS debits,
  SUM(l.credit) AS credits,
  SUM(l.debit) - SUM(l.credit) AS imbalance
FROM "JournalEntry" e
JOIN "JournalLine" l ON l."journalEntryId" = e.id
GROUP BY e.id, e."entryDate"
HAVING ABS(SUM(l.debit) - SUM(l.credit)) > 0.01
ORDER BY ABS(SUM(l.debit) - SUM(l.credit)) DESC
LIMIT 20;

\echo '═══════════════════════════════════════════════════════'
\echo ' 4. PO line qtyReceived vs GoodsReceipt lines'
\echo '═══════════════════════════════════════════════════════'
SELECT l.id AS line_id, l."qtyOrdered", l."qtyReceived" AS recorded,
  COALESCE(r.received, 0) AS recomputed,
  l."qtyReceived" - COALESCE(r.received, 0) AS drift
FROM "PurchaseOrderLine" l
LEFT JOIN (
  SELECT gl."purchaseOrderLineId", SUM(gl."qtyReceived") AS received
  FROM "GoodsReceiptLine" gl
  JOIN "GoodsReceipt" g ON g.id = gl."goodsReceiptId" AND g."rejectedAt" IS NULL
  GROUP BY 1
) r ON r."purchaseOrderLineId" = l.id
WHERE l."qtyReceived" <> COALESCE(r.received, 0)
ORDER BY ABS(l."qtyReceived" - COALESCE(r.received, 0)) DESC
LIMIT 20;

\echo '═══════════════════════════════════════════════════════'
\echo ' 5. Over-received PO lines (qtyReceived > qtyOrdered)'
\echo '═══════════════════════════════════════════════════════'
SELECT id, "qtyOrdered", "qtyReceived" FROM "PurchaseOrderLine" WHERE "qtyReceived" > "qtyOrdered" LIMIT 20;

\echo '═══════════════════════════════════════════════════════'
\echo ' 6. Orphans — rows pointing at deleted parents'
\echo '═══════════════════════════════════════════════════════'
SELECT 'sm-material' AS kind, m.id FROM "StockMovement" m
  JOIN "Material" mt ON mt.id = m."materialId" WHERE mt."deletedAt" IS NOT NULL LIMIT 5;
SELECT 'sli-material' AS kind, i.id FROM "StockLocationItem" i
  JOIN "Material" mt ON mt.id = i."materialId" WHERE mt."deletedAt" IS NOT NULL LIMIT 5;
SELECT 'sli-location' AS kind, i.id FROM "StockLocationItem" i
  JOIN "StockLocation" l ON l.id = i."locationId" WHERE l."deletedAt" IS NOT NULL LIMIT 5;

\echo '═══════════════════════════════════════════════════════'
\echo ' 7. Dangling foreign refs (non-null ids that resolve to nothing)'
\echo '═══════════════════════════════════════════════════════'
SELECT 'sm-from-loc' AS kind, COUNT(*) FROM "StockMovement" m
  LEFT JOIN "StockLocation" l ON l.id = m."fromLocationId"
  WHERE m."fromLocationId" IS NOT NULL AND l.id IS NULL;
SELECT 'sm-to-loc' AS kind, COUNT(*) FROM "StockMovement" m
  LEFT JOIN "StockLocation" l ON l.id = m."toLocationId"
  WHERE m."toLocationId" IS NOT NULL AND l.id IS NULL;
SELECT 'gp-ref-missing' AS kind, COUNT(*) FROM "GatePass" g
  WHERE g."refType" = 'StockTransfer' AND NOT EXISTS (
    SELECT 1 FROM "StockTransfer" t WHERE t.id = g."refId");

\echo '═══════════════════════════════════════════════════════'
\echo ' 8. Audit coverage — every material write logged?'
\echo '═══════════════════════════════════════════════════════'
SELECT 'po-no-audit' AS kind, COUNT(*) FROM "PurchaseOrder" p
  WHERE NOT EXISTS (
    SELECT 1 FROM "AuditLog" a WHERE a."entityId" = p.id AND a."entityType" ILIKE '%purchase%');
SELECT 'sale-no-audit' AS kind, COUNT(*) FROM "AssetSale" s
  WHERE NOT EXISTS (
    SELECT 1 FROM "AuditLog" a WHERE a."entityId" = s.id);
