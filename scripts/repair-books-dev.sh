#!/usr/bin/env bash
# Dev-only books repair — removes workflow-verification fixture rows that the
# verify scripts seed via raw SQL (bypassing the service layer, so no journal
# entries, no stock-cache sync, no audit trail), then rebuilds the
# StockLocationItem cache from the immutable StockMovement log so
# /api/health/books reads true instead of flagging fixture drift.
#
# Fixture markers: ids prefixed 'vfy' (verify-workflows-full.sh) and 'hrc'
# (verify-hr-chain.sh). API-created children of vfy parents die by FK cascade;
# journal entries reference them via the loose sourceId string and are deleted
# explicitly.
#
# Usage: ./scripts/repair-books-dev.sh [--check]
#   --check   hit /api/health/books afterwards (needs cookie jar at
#             $COOKIE_JAR, default /tmp/nirman-cookies.txt — sign in via
#             /api/auth/demo-login first)
#
# MUTATES the DB — dev/staging only. Never run against production.

set -u
DB="${DATABASE_NAME:-nirman_inventory}"
P() { psql -h localhost -d "$DB" -tAc "$1"; }
PX() { psql -h localhost -d "$DB" -c "$1"; }

echo "═══ 1. Fixture journal entries (sourceId vfy*/hrc*, memo 'wf verify') ═══"
JES=$(P "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceId\" LIKE 'vfy%' OR \"sourceId\" LIKE 'hrc%' OR memo ILIKE '%wf verify%' OR memo ILIKE 'wf %'")
echo "  deleting $JES journal entries (lines cascade)"
PX "DELETE FROM \"JournalEntry\" WHERE \"sourceId\" LIKE 'vfy%' OR \"sourceId\" LIKE 'hrc%' OR memo ILIKE '%wf verify%' OR memo ILIKE 'wf %'" | tail -1

echo "═══ 2. Fixture rows (id LIKE 'vfy%' / 'hrc%') — parents; FK cascades take children ═══"
# GoodsReceipt chain references PurchaseOrder with Restrict (no cascade) —
# delete API-created receipt children of fixture POs first.
N=$(P "SELECT count(*) FROM \"GoodsReceiptLine\" l JOIN \"GoodsReceipt\" g ON g.id=l.\"goodsReceiptId\"
  WHERE g.\"purchaseOrderId\" LIKE 'vfy%' OR g.\"purchaseOrderId\" LIKE 'hrc%'")
[ "${N:-0}" != "0" ] && PX "DELETE FROM \"GoodsReceiptLine\" l USING \"GoodsReceipt\" g
  WHERE l.\"goodsReceiptId\"=g.id AND (g.\"purchaseOrderId\" LIKE 'vfy%' OR g.\"purchaseOrderId\" LIKE 'hrc%')" | tail -1 \
  && PX "DELETE FROM \"GoodsReceipt\" WHERE \"purchaseOrderId\" LIKE 'vfy%' OR \"purchaseOrderId\" LIKE 'hrc%'" | tail -1 \
  && echo "  GoodsReceipt chain: $N line(s) removed"
# Same for PO lines referenced from receipt lines (Restrict).
PX "DELETE FROM \"GoodsReceiptLine\" l USING \"PurchaseOrderLine\" p
  WHERE l.\"purchaseOrderLineId\"=p.id AND (p.\"purchaseOrderId\" LIKE 'vfy%' OR p.\"purchaseOrderId\" LIKE 'hrc%')" >/dev/null 2>&1
for T in \
  DailyProgressReport MeasurementBookEntry Tenancy StockTransfer \
  ChangeOrder SafetyHazard RateContract DirectPurchase ScrapGeneration \
  NonConformanceReport SafetyIncident Equipment PurchaseOrder \
  SubcontractorWorkOrder Employee AssetSalePayment GatePass \
  LeaveApplication StockIssue StockCount ExpenseClaim \
; do
  N=$(P "SELECT count(*) FROM \"$T\" WHERE id LIKE 'vfy%' OR id LIKE 'hrc%'" 2>/dev/null)
  if [ "${N:-0}" != "0" ]; then
    R=$(PX "DELETE FROM \"$T\" WHERE id LIKE 'vfy%' OR id LIKE 'hrc%'" 2>&1 | tail -1)
    echo "  $T: $R (was $N)"
  fi
done

echo "═══ 2b. Orphaned journal entries — JE lines pointing at rows deleted above ═══"
# API-created children of fixture parents (cuid ids, e.g. RaBills on vfy
# work-orders) cascade-deleted with their parent — but the JEs they posted
# survive with a dangling entityId. Sweep every entityType that maps to a
# real table and delete JEs whose lines reference a missing row.
ORPHAN_JES=0
for T in $(P "SELECT DISTINCT \"entityType\" FROM \"JournalLine\" WHERE \"entityType\" IS NOT NULL"); do
  EXISTS=$(P "SELECT to_regclass('\"$T\"') IS NOT NULL")
  [ "$EXISTS" != "t" ] && continue
  N=$(P "SELECT count(*) FROM \"JournalEntry\" je WHERE EXISTS (
    SELECT 1 FROM \"JournalLine\" l WHERE l.\"journalEntryId\"=je.id AND l.\"entityType\"='$T'
    AND NOT EXISTS (SELECT 1 FROM \"$T\" r WHERE r.id=l.\"entityId\"))")
  if [ "${N:-0}" != "0" ]; then
    PX "DELETE FROM \"JournalEntry\" je WHERE EXISTS (
      SELECT 1 FROM \"JournalLine\" l WHERE l.\"journalEntryId\"=je.id AND l.\"entityType\"='$T'
      AND NOT EXISTS (SELECT 1 FROM \"$T\" r WHERE r.id=l.\"entityId\"))" >/dev/null
    ORPHAN_JES=$((ORPHAN_JES + N))
    echo "  $T: deleted $N JE(s) with dangling entityIds"
  fi
done
echo "  $ORPHAN_JES orphaned JE(s) removed"

echo "═══ 2c. Orphaned TRANSFER_OUT movements (refs to deleted transfers) ═══"
# Seeded IN_TRANSIT transfers deleted above leave their dispatch movements —
# stock "in transit" forever. The movement log is append-only for real data,
# but these refs point at deleted fixture rows, not history.
N=$(P "SELECT count(*) FROM \"StockMovement\" m WHERE m.\"refType\"='StockTransfer'
  AND NOT EXISTS (SELECT 1 FROM \"StockTransfer\" t WHERE t.id=m.\"refId\")")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"StockMovement\" m WHERE m.\"refType\"='StockTransfer'
    AND NOT EXISTS (SELECT 1 FROM \"StockTransfer\" t WHERE t.id=m.\"refId\")" | tail -1
  echo "  $N orphaned transfer movement(s) removed"
fi

echo "═══ 3. StockLocationItem cache rebuild from StockMovement log ═══"
# For every (locationId, materialId) pair: qty := Σ IN − Σ OUT, and
# movingAvgCost := balanceValueAfter / balanceAfter from the pair's latest
# movement (the running-balance snapshots the movement log already stores).
# Pairs with no movement history keep their MAC but get qty 0 — cache must
# mirror the log; reseed through services if you need that stock back.
read -r PAIRS CHANGED <<<"$(P "
WITH ins AS (
  SELECT \"toLocationId\" AS loc, \"materialId\", SUM(qty) q
  FROM \"StockMovement\" WHERE \"toLocationId\" IS NOT NULL
    AND \"movementType\" IN ('PURCHASE_RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','SCRAP_GENERATED','OPENING_BALANCE')
  GROUP BY 1,2
), outs AS (
  SELECT \"fromLocationId\" AS loc, \"materialId\", SUM(qty) q
  FROM \"StockMovement\" WHERE \"fromLocationId\" IS NOT NULL
    AND \"movementType\" IN ('TRANSFER_OUT','ISSUE_TO_PROJECT','ISSUE_TO_DEPARTMENT','ADJUSTMENT_OUT','RETURN','SALE')
  GROUP BY 1,2
), expected AS (
  SELECT s.id, s.\"locationId\", s.\"materialId\", s.qty AS actual,
         COALESCE(i.q,0) - COALESCE(o.q,0) AS exp
  FROM \"StockLocationItem\" s
  LEFT JOIN ins   i ON i.loc = s.\"locationId\" AND i.\"materialId\" = s.\"materialId\"
  LEFT JOIN outs  o ON o.loc = s.\"locationId\" AND o.\"materialId\" = s.\"materialId\"
  -- exp < 0 means the movement log itself is inconsistent (outs without ins)
  -- — no legal cache value can represent it (qty is non-negative). Skip
  -- and report below rather than clamping and hiding the drift.
  WHERE COALESCE(i.q,0) - COALESCE(o.q,0) >= 0
), latest AS (
  SELECT DISTINCT ON (COALESCE(\"toLocationId\",\"fromLocationId\"), \"materialId\")
         COALESCE(\"toLocationId\",\"fromLocationId\") AS loc, \"materialId\",
         \"balanceAfter\", \"balanceValueAfter\"
  FROM \"StockMovement\"
  ORDER BY COALESCE(\"toLocationId\",\"fromLocationId\"), \"materialId\", timestamp DESC, id DESC
), upd AS (
  UPDATE \"StockLocationItem\" s
  SET qty = e.exp,
      \"movingAvgCost\" = CASE
        WHEN l.\"balanceAfter\" > 0 THEN ROUND(l.\"balanceValueAfter\" / l.\"balanceAfter\", 2)
        ELSE s.\"movingAvgCost\" END,
      \"updatedAt\" = now()
  FROM expected e
  LEFT JOIN latest l ON l.loc = e.\"locationId\" AND l.\"materialId\" = e.\"materialId\"
  WHERE s.id = e.id AND ABS(s.qty - e.exp) > 0.001
  RETURNING s.id
)
SELECT (SELECT count(*) FROM expected), (SELECT count(*) FROM upd)" | tr -d ' |')"
echo "  $CHANGED of $PAIRS cache rows corrected"
# Report pairs skipped because their movement log is itself inconsistent
# (net-negative) — these need investigation, not a cache repair.
NEG=$(P "
WITH ins AS (SELECT \"toLocationId\" AS loc, \"materialId\", SUM(qty) q FROM \"StockMovement\"
  WHERE \"toLocationId\" IS NOT NULL AND \"movementType\" IN ('PURCHASE_RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','SCRAP_GENERATED','OPENING_BALANCE') GROUP BY 1,2),
     outs AS (SELECT \"fromLocationId\" AS loc, \"materialId\", SUM(qty) q FROM \"StockMovement\"
  WHERE \"fromLocationId\" IS NOT NULL AND \"movementType\" IN ('TRANSFER_OUT','ISSUE_TO_PROJECT','ISSUE_TO_DEPARTMENT','ADJUSTMENT_OUT','RETURN','SALE') GROUP BY 1,2)
SELECT count(*) FROM \"StockLocationItem\" s
LEFT JOIN ins i ON i.loc=s.\"locationId\" AND i.\"materialId\"=s.\"materialId\"
LEFT JOIN outs o ON o.loc=s.\"locationId\" AND o.\"materialId\"=s.\"materialId\"
WHERE COALESCE(i.q,0) - COALESCE(o.q,0) < 0")
[ "${NEG:-0}" != "0" ] && echo "  ⚠ $NEG pair(s) have net-negative movement logs — skipped (unrepairable)"

echo "═══ 3b. Supplier.balanceOwed rebuild from doc-resolved AP GL ═══"
# Mirrors reconcileSupplierAp: net (credit−debit) on the AP account resolved
# per supplier through PurchaseOrder / SupplierInvoice / SupplierPayment /
# SupplierReturn / DirectPurchase entityIds. The GL is authoritative after
# the orphan sweep above — doc-deleted rows can't skew it.
PX "
WITH ap AS (SELECT a.id, a.\"companyId\" FROM \"GlAccount\" a WHERE a.code='2000'),
lines AS (
  SELECT je.\"companyId\", l.\"entityType\", l.\"entityId\", l.debit, l.credit
  FROM \"JournalLine\" l
  JOIN \"JournalEntry\" je ON je.id=l.\"journalEntryId\"
  JOIN ap ON ap.id=l.\"accountId\" AND ap.\"companyId\"=je.\"companyId\"
  WHERE je.status='POSTED'
), resolved AS (
  SELECT po.\"supplierId\" sid, l.credit, l.debit FROM lines l JOIN \"PurchaseOrder\" po ON po.id=l.\"entityId\" AND l.\"entityType\"='PurchaseOrder'
  UNION ALL SELECT si.\"supplierId\", l.credit, l.debit FROM lines l JOIN \"SupplierInvoice\" si ON si.id=l.\"entityId\" AND l.\"entityType\"='SupplierInvoice'
  UNION ALL SELECT sp.\"supplierId\", l.credit, l.debit FROM lines l JOIN \"SupplierPayment\" sp ON sp.id=l.\"entityId\" AND l.\"entityType\"='SupplierPayment'
  UNION ALL SELECT sr.\"supplierId\", l.credit, l.debit FROM lines l JOIN \"SupplierReturn\" sr ON sr.id=l.\"entityId\" AND l.\"entityType\"='SupplierReturn'
  UNION ALL SELECT dp.\"supplierId\", l.credit, l.debit FROM lines l JOIN \"DirectPurchase\" dp ON dp.id=l.\"entityId\" AND l.\"entityType\"='DirectPurchase'
), nets AS (SELECT sid, SUM(credit-debit) net FROM resolved GROUP BY sid)
UPDATE \"Supplier\" s
SET \"balanceOwed\" = COALESCE(n.net,0), \"updatedAt\" = now()
FROM nets n WHERE s.id=n.sid AND s.\"balanceOwed\" IS DISTINCT FROM COALESCE(n.net,0)" | tail -1

if [ "${1:-}" = "--check" ]; then
  echo "═══ 4. /api/health/books ═══"
  BASE="${BASE:-http://localhost:3000}"
  JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
  curl -s -b "$JAR" --max-time 60 "$BASE/api/health/books" \
    | python3 -c "
import json,sys
d = json.load(sys.stdin)
for c in d.get('checks', []):
    print(f\"  {c.get('status','?'):5} {c.get('name', c.get('id','?'))}\")
print(f\"  → {d.get('summary','')}\" if d.get('summary') else '')
" || echo "  (health-books request failed — is the dev server up and the cookie jar fresh?)"
fi

echo "Done. Re-run verify scripts to confirm they stay green against a clean base."
