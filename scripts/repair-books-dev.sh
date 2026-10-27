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
# sourceId 'vfy-opening-stock%' is the PERSISTENT fixture baseline — the
# Dr 1300 / Cr 3000 opening entry covering the fixture stock the suite draws
# from. It survives cleanup like the fixture parcel/customer rows do.
JES=$(P "SELECT count(*) FROM \"JournalEntry\" WHERE (\"sourceId\" LIKE 'vfy%' OR \"sourceId\" LIKE 'hrc%' OR memo ILIKE '%wf verify%' OR memo ILIKE 'wf %') AND coalesce(\"sourceId\",'') NOT LIKE 'vfy-opening-stock%'")
echo "  deleting $JES journal entries (lines cascade)"
PX "DELETE FROM \"JournalEntry\" WHERE (\"sourceId\" LIKE 'vfy%' OR \"sourceId\" LIKE 'hrc%' OR memo ILIKE '%wf verify%' OR memo ILIKE 'wf %') AND coalesce(\"sourceId\",'') NOT LIKE 'vfy-opening-stock%'" | tail -1

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
  AssetSale LandParcel LandPurchase Customer PayrollPeriod \
; do
  N=$(P "SELECT count(*) FROM \"$T\" WHERE id LIKE 'vfy%' OR id LIKE 'hrc%'" 2>/dev/null)
  if [ "${N:-0}" != "0" ]; then
    R=$(PX "DELETE FROM \"$T\" WHERE id LIKE 'vfy%' OR id LIKE 'hrc%'" 2>&1 | tail -1)
    echo "  $T: $R (was $N)"
  fi
done

echo "═══ 2a. API-created fixture rows (cuid ids, 'wf *'/'vfy*' text markers) ═══"
# Some fixtures are created through the real API and get cuid ids — they're
# identifiable only by their marker text in reason/notes/memo columns.
# MaterialSaleReturn → MaterialSale is Restrict: returns (+lines) go first.
N=$(P "SELECT count(*) FROM \"MaterialSaleReturn\" r JOIN \"MaterialSale\" s ON s.id=r.\"materialSaleId\" WHERE s.notes ILIKE 'wf %' OR s.notes ILIKE 'wf-%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"MaterialSaleReturnLine\" l USING \"MaterialSaleReturn\" r, \"MaterialSale\" s
    WHERE l.\"materialSaleReturnId\"=r.id AND r.\"materialSaleId\"=s.id AND (s.notes ILIKE 'wf %' OR s.notes ILIKE 'wf-%')" >/dev/null
  PX "DELETE FROM \"MaterialSaleReturn\" r USING \"MaterialSale\" s
    WHERE r.\"materialSaleId\"=s.id AND (s.notes ILIKE 'wf %' OR s.notes ILIKE 'wf-%')" >/dev/null
  echo "  MaterialSaleReturn chain: $N row(s) removed"
fi
for pair in \
  "LeaveRequest:reason" "WorkerAttendance:notes" \
  "AttendanceCorrectionRequest:reason" "ExpenseClaim:notes" \
  "Expense:notes" "AssetSale:notes" "MaterialSale:notes" \
  "MeasurementBookEntry:description" "WbsNode:name" "BuiltUnit:unitNumber" \
  "Task:title" "Tenancy:tenantName" "LandPurchase:sellerName" \
  "DirectPurchase:notes" "SafetyInspection:title" \
; do
  T="${pair%%:*}"; COL="${pair##*:}"
  N=$(P "SELECT count(*) FROM \"$T\" WHERE \"$COL\"='wf' OR \"$COL\" ILIKE 'wf %' OR \"$COL\" ILIKE 'wf-%'" 2>/dev/null)
  if [ "${N:-0}" != "0" ]; then
    PX "DELETE FROM \"$T\" WHERE \"$COL\"='wf' OR \"$COL\" ILIKE 'wf %' OR \"$COL\" ILIKE 'wf-%'" 2>&1 | tail -1
    echo "  $T.$COL: $N fixture row(s) removed"
  fi
done

# verify-workflows-full.sh tenancy chain leaves 'tenant-a'/'tenant-b' rows
# (activate→schedule→escalate→terminate + changeTenant). RentalPayment cascades.
N=$(P "SELECT count(*) FROM \"Tenancy\" WHERE \"tenantName\" IN ('tenant-a','tenant-b')")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"Tenancy\" WHERE \"tenantName\" IN ('tenant-a','tenant-b')" | tail -1
  echo "  Tenancy tenant-a/b: $N fixture row(s) removed"
fi

# verify-issue-chain.sh indents — ISR-S-*/ISR-A-* reqNumbers on isrs/isra ids.
# Lines cascade; MaterialIssue/DirectPurchase refs SetNull harmlessly.
N=$(P "SELECT count(*) FROM \"MaterialRequisition\" WHERE \"reqNumber\" LIKE 'ISR-%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"MaterialRequisition\" WHERE \"reqNumber\" LIKE 'ISR-%'" | tail -1
  echo "  MaterialRequisition ISR-*: $N fixture row(s) removed"
fi

# verify-direct-purchase-chain.sh cancels its spot buys every run — CANCELLED
# supplier-less bills are the chain's cash-market fixture (real spot buys keep
# a supplier or a note). Reversal JEs die with the rows; §2b handles strays.
N=$(P "SELECT count(*) FROM \"DirectPurchase\" WHERE status='CANCELLED' AND \"supplierId\" IS NULL AND (notes IS NULL OR notes='')")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"DirectPurchase\" WHERE status='CANCELLED' AND \"supplierId\" IS NULL AND (notes IS NULL OR notes='')" | tail -1
  echo "  DirectPurchase spot-cancel fixtures: $N row(s) removed"
fi
# Same chain's supplier-linked leg: qty10@40+18%GST = exactly ₹472.00, always
# cancelled same-day. Real Ganga bills differ in amount and/or timing.
N=$(P "SELECT count(*) FROM \"DirectPurchase\" d WHERE d.status='CANCELLED' AND d.\"billAmount\"=472.00 AND d.\"createdAt\"::date=d.\"cancelledAt\"::date AND EXISTS (SELECT 1 FROM \"Supplier\" s WHERE s.id=d.\"supplierId\" AND s.name='Ganga Aggregate Works')")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"DirectPurchase\" d WHERE d.status='CANCELLED' AND d.\"billAmount\"=472.00 AND d.\"createdAt\"::date=d.\"cancelledAt\"::date AND EXISTS (SELECT 1 FROM \"Supplier\" s WHERE s.id=d.\"supplierId\" AND s.name='Ganga Aggregate Works')" | tail -1
  echo "  DirectPurchase Ganga-cancel fixtures: $N row(s) removed"
fi

# verify-procurement-chain.sh / verify-supplier-payment-tds.sh leave 'wf
# supplier tds' / 'wf procurement supplier' vendors with RESTRICT-protected
# invoices and payments — children first, then the suppliers.
N=$(P "SELECT count(*) FROM \"Supplier\" WHERE name ILIKE 'wf %' OR name ILIKE 'wf-%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"SupplierPayment\" sp USING \"Supplier\" s WHERE s.id=sp.\"supplierId\" AND (s.name ILIKE 'wf %' OR s.name ILIKE 'wf-%')" | tail -1
  PX "DELETE FROM \"SupplierInvoice\" si USING \"Supplier\" s WHERE s.id=si.\"supplierId\" AND (s.name ILIKE 'wf %' OR s.name ILIKE 'wf-%')" | tail -1
  PX "DELETE FROM \"Supplier\" WHERE name ILIKE 'wf %' OR name ILIKE 'wf-%'" | tail -1
  echo "  Supplier wf-fixture: $N vendor(s) removed (+ payments/invoices)"
fi

# verify-land-purchase-chain.sh 'Verifier Seller'/'Cancel Seller' purchases.
# LandParcel/costs/payments/schedules/docs cascade; guard parcels still
# referenced by a tenancy so a stray link skips loudly instead of dangling.
N=$(P "SELECT count(*) FROM \"LandPurchase\" WHERE \"sellerName\" IN ('Verifier Seller','Cancel Seller')")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"LandPurchase\" l WHERE l.\"sellerName\" IN ('Verifier Seller','Cancel Seller')
    AND NOT EXISTS (
      SELECT 1 FROM \"LandParcel\" lp JOIN \"Tenancy\" t ON t.\"landParcelId\"=lp.id
      WHERE lp.\"landPurchaseId\"=l.id)" | tail -1
  echo "  LandPurchase verifier/cancel: $N fixture row(s) removed (tenancy-referenced skipped)"
fi

# Orphaned LAND sales — verify-asset-sale-chain.sh sells vfylp% parcels whose
# parent purchases die above; landParcelId SetNulls to NULL leaving headless
# sales. Payments/schedules/expenses/terms cascade; §2b cleans their JEs.
N=$(P "SELECT count(*) FROM \"AssetSale\" WHERE \"assetType\"='LAND' AND \"landParcelId\" IS NULL")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"AssetSale\" WHERE \"assetType\"='LAND' AND \"landParcelId\" IS NULL" | tail -1
  echo "  AssetSale orphan-land: $N fixture row(s) removed"
fi

# clp-chain BOQ items sit under Restrict FKs (MeasurementBookEntry above must
# go first; WO lines / RaBill lines shouldn't exist but guard anyway so a
# referenced item is skipped loudly rather than failing the whole run).
for pair in "description:wf clp verify" "serialNo:WF-CLP"; do
  COL="${pair%%:*}"
  N=$(P "SELECT count(*) FROM \"BoqItem\" b WHERE b.\"$COL\" ILIKE '${pair##*:}%'")
  if [ "${N:-0}" != "0" ]; then
    PX "DELETE FROM \"BoqItem\" b WHERE b.\"$COL\" ILIKE '${pair##*:}%'
      AND NOT EXISTS (SELECT 1 FROM \"MeasurementBookEntry\" m WHERE m.\"boqItemId\"=b.id)
      AND NOT EXISTS (SELECT 1 FROM \"SubcontractorWorkOrderLine\" w WHERE w.\"boqItemId\"=b.id)
      AND NOT EXISTS (SELECT 1 FROM \"RaBillLine\" r WHERE r.\"boqItemId\"=b.id)" 2>&1 | tail -1
    echo "  BoqItem.$COL: $N fixture row(s) removed (unguarded refs skipped)"
  fi
done

# Chain-script marker: ProjectCost rows stamped '— <chain> chain verify' —
# their parent RaBills die elsewhere; the cost docs must follow or doc-side
# WIP inflates with no GL behind it.
N=$(P "SELECT count(*) FROM \"ProjectCost\" WHERE notes ILIKE '%chain verify%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"ProjectCost\" WHERE notes ILIKE '%chain verify%'" | tail -1
  echo "  ProjectCost chain-fixture: $N row(s) removed"
fi

# Orphaned RA-bill cost docs: a ProjectCost 'RA Bill RA-####-####' whose bill
# was swept (probe/chain WOs cascade their bills but not these docs) leaves
# doc-side WIP inflated with no GL behind it.
N=$(P "SELECT count(*) FROM \"ProjectCost\" pc WHERE pc.notes ~ 'RA Bill (RA-[0-9]+-[0-9]+)' AND NOT EXISTS (SELECT 1 FROM \"RaBill\" rb WHERE rb.\"raBillNumber\" = substring(pc.notes from 'RA Bill (RA-[0-9]+-[0-9]+)'))")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"ProjectCost\" pc WHERE pc.notes ~ 'RA Bill (RA-[0-9]+-[0-9]+)' AND NOT EXISTS (SELECT 1 FROM \"RaBill\" rb WHERE rb.\"raBillNumber\" = substring(pc.notes from 'RA Bill (RA-[0-9]+-[0-9]+)'))" | tail -1
  echo "  ProjectCost orphan-RA-bill: $N row(s) removed"
fi

# Subcontractor-WO chain fixtures: chain-runner.mjs ('chain verify: *'),
# verify-ra-bill-chain.sh ('ra chain verify' / WO-RA-*), and ad-hoc
# 'Attribution probe' WOs. MB entries on these WOs have no inbound FKs and go
# first; the WO delete cascades WO lines + RA bills + RA bill lines and
# SetNulls any stray MB links.
N=$(P "SELECT count(*) FROM \"MeasurementBookEntry\" m LEFT JOIN \"SubcontractorWorkOrder\" w ON w.id=m.\"workOrderId\" WHERE m.description ILIKE 'chain verify%' OR m.description ILIKE 'WO-% probe%' OR w.\"workTitle\" ILIKE 'chain verify%' OR w.\"workTitle\" LIKE 'Attribution probe%' OR w.\"workTitle\" LIKE 'ra chain verify%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"MeasurementBookEntry\" m WHERE m.description ILIKE 'chain verify%' OR m.description ILIKE 'WO-% probe%' OR m.\"workOrderId\" IN (
    SELECT id FROM \"SubcontractorWorkOrder\" w WHERE w.\"workTitle\" ILIKE 'chain verify%' OR w.\"workTitle\" LIKE 'Attribution probe%' OR w.\"workTitle\" LIKE 'ra chain verify%')" | tail -1
  echo "  MeasurementBookEntry WO-chain: $N row(s) removed"
fi
N=$(P "SELECT count(*) FROM \"SubcontractorWorkOrder\" WHERE \"workTitle\" ILIKE 'chain verify%' OR \"workTitle\" LIKE 'Attribution probe%' OR \"workTitle\" LIKE 'ra chain verify%' OR \"workOrderNumber\" LIKE 'WO-RA-%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"SubcontractorWorkOrder\" WHERE \"workTitle\" ILIKE 'chain verify%' OR \"workTitle\" LIKE 'Attribution probe%' OR \"workTitle\" LIKE 'ra chain verify%' OR \"workOrderNumber\" LIKE 'WO-RA-%'" | tail -1
  echo "  SubcontractorWorkOrder chain-fixture: $N row(s) removed (+ cascaded RA bills/lines)"
fi
# verify-ra-bill-chain.sh RA-VFY-* BOQ items — Restrict-FK guarded like the
# clp block above.
N=$(P "SELECT count(*) FROM \"BoqItem\" b WHERE b.\"serialNo\" LIKE 'RA-VFY-%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"BoqItem\" b WHERE b.\"serialNo\" LIKE 'RA-VFY-%'
    AND NOT EXISTS (SELECT 1 FROM \"MeasurementBookEntry\" m WHERE m.\"boqItemId\"=b.id)
    AND NOT EXISTS (SELECT 1 FROM \"SubcontractorWorkOrderLine\" w WHERE w.\"boqItemId\"=b.id)
    AND NOT EXISTS (SELECT 1 FROM \"RaBillLine\" r WHERE r.\"boqItemId\"=b.id)" 2>&1 | tail -1
  echo "  BoqItem RA-VFY: $N fixture row(s) removed (unguarded refs skipped)"
fi

# Chain-script unit fixtures: isu*/wcu*/wcp*/is-pu* id prefixes (issue/wip chains).
N=$(P "SELECT count(*) FROM \"BuiltUnit\" WHERE id LIKE 'isu%' OR id LIKE 'wcu%' OR id LIKE 'wcp%' OR id LIKE 'is-pu%' OR \"unitNumber\" ILIKE 'IS-PLANNED-%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"BuiltUnit\" WHERE id LIKE 'isu%' OR id LIKE 'wcu%' OR id LIKE 'wcp%' OR id LIKE 'is-pu%' OR \"unitNumber\" ILIKE 'IS-PLANNED-%'" | tail -1
  echo "  BuiltUnit chain-fixture: $N row(s) removed"
fi

# Issue-chain scaffolding: verify-issue-chain.sh seeds a synthetic ON_HOLD
# project (isoh*) + department (isd* / 'is-dept-office') per run. Guarded to
# rows with no dependents so a real row with an accidental prefix survives.
N=$(P "SELECT count(*) FROM \"Project\" p WHERE p.id LIKE 'isoh%' AND NOT EXISTS (
  SELECT 1 FROM \"DailyProgressReport\" d WHERE d.\"projectId\"=p.id
) AND NOT EXISTS (SELECT 1 FROM \"Expense\" e WHERE e.\"projectId\"=p.id)
  AND NOT EXISTS (SELECT 1 FROM \"BoqItem\" b WHERE b.\"projectId\"=p.id)
  AND NOT EXISTS (SELECT 1 FROM \"BuiltUnit\" u WHERE u.\"projectId\"=p.id)
  AND NOT EXISTS (SELECT 1 FROM \"WbsNode\" w WHERE w.\"projectId\"=p.id)
  AND NOT EXISTS (SELECT 1 FROM \"MaterialRequisition\" r WHERE r.\"projectId\"=p.id)
  AND NOT EXISTS (SELECT 1 FROM \"AssetSale\" s WHERE s.\"projectId\"=p.id)")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"Project\" p WHERE p.id LIKE 'isoh%' AND NOT EXISTS (
    SELECT 1 FROM \"DailyProgressReport\" d WHERE d.\"projectId\"=p.id
  ) AND NOT EXISTS (SELECT 1 FROM \"Expense\" e WHERE e.\"projectId\"=p.id)
    AND NOT EXISTS (SELECT 1 FROM \"BoqItem\" b WHERE b.\"projectId\"=p.id)
    AND NOT EXISTS (SELECT 1 FROM \"BuiltUnit\" u WHERE u.\"projectId\"=p.id)
    AND NOT EXISTS (SELECT 1 FROM \"WbsNode\" w WHERE w.\"projectId\"=p.id)
    AND NOT EXISTS (SELECT 1 FROM \"MaterialRequisition\" r WHERE r.\"projectId\"=p.id)
    AND NOT EXISTS (SELECT 1 FROM \"AssetSale\" s WHERE s.\"projectId\"=p.id)" | tail -1
  echo "  Project issue-chain: $N empty shell(s) removed"
fi
N=$(P "SELECT count(*) FROM \"Department\" d WHERE (d.id LIKE 'isd%' OR d.name ILIKE 'is-dept-%')
  AND NOT EXISTS (SELECT 1 FROM \"Employee\" e WHERE e.\"departmentId\"=d.id)")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"Department\" d WHERE (d.id LIKE 'isd%' OR d.name ILIKE 'is-dept-%')
    AND NOT EXISTS (SELECT 1 FROM \"Employee\" e WHERE e.\"departmentId\"=d.id)" | tail -1
  echo "  Department issue-chain: $N empty shell(s) removed"
fi

# Land-purchase-chain projects (wlp-*): land purchases carry payments/parcels/
# docs that all CASCADE from LandPurchase — delete them first (their FK to
# Project is SET NULL, so deleting the project first would orphan them).
N=$(P "SELECT count(*) FROM \"LandPurchase\" WHERE \"projectId\" LIKE 'wlp-%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"LandPurchase\" WHERE \"projectId\" LIKE 'wlp-%'" | tail -1
  echo "  LandPurchase wlp-chain: $N row(s) removed"
fi

# Payroll-GL-chain fixtures (verify-payroll-gl-chain.sh): glce* employees run
# through real payroll — cascade removes attendance/advances/payroll lines;
# their JEs fall to the §2b orphan sweep. glcp* projects carry a handful of
# fixture attendance rows (SET NULL) — delete those first, then the projects.
N=$(P "SELECT count(*) FROM \"Employee\" WHERE id LIKE 'glce%'")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"Employee\" WHERE id LIKE 'glce%'" | tail -1
  echo "  Employee glc-chain: $N row(s) removed"
fi
PX "DELETE FROM \"WorkerAttendance\" WHERE \"projectId\" LIKE 'glcp%' OR \"projectId\" LIKE 'wlp-%'" >/dev/null
PX "DELETE FROM \"ProjectCost\" WHERE \"projectId\" LIKE 'glcp%' OR \"projectId\" LIKE 'wlp-%'" >/dev/null
N=$(P "SELECT count(*) FROM \"Project\" p WHERE (p.id LIKE 'glcp%' OR p.id LIKE 'wlp-%')
  AND NOT EXISTS (SELECT 1 FROM \"EscrowWithdrawal\" w WHERE w.\"projectId\"=p.id)")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"Project\" p WHERE (p.id LIKE 'glcp%' OR p.id LIKE 'wlp-%')
    AND NOT EXISTS (SELECT 1 FROM \"EscrowWithdrawal\" w WHERE w.\"projectId\"=p.id)" | tail -1
  echo "  Project glc/wlp-chain: $N fixture row(s) removed"
fi

echo "═══ 2b. Orphaned journal entries — JE lines pointing at rows deleted above ═══"
# API-created children of fixture parents (cuid ids, e.g. RaBills on vfy
# work-orders) cascade-deleted with their parent — but the JEs they posted
# survive with a dangling entityId. Sweep every entityType that maps to a
# real table and delete JEs whose lines reference a missing row.
ORPHAN_JES=0
for T in $(P "SELECT DISTINCT \"entityType\" FROM \"JournalLine\" WHERE \"entityType\" IS NOT NULL"); do
  TT="$T"
  EXISTS=$(P "SELECT to_regclass('\"$TT\"') IS NOT NULL")
  if [ "$EXISTS" != "t" ]; then
    # entityType may be SCREAMING_SNAKE — resolve to PascalCase
    # (BUILT_UNIT → BuiltUnit) before giving up.
    TT=$(echo "$T" | tr '[:upper:]_' '[:lower:] ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' | tr -d ' ')
    EXISTS=$(P "SELECT to_regclass('\"$TT\"') IS NOT NULL")
  fi
  [ "$EXISTS" != "t" ] && continue
  N=$(P "SELECT count(*) FROM \"JournalEntry\" je WHERE EXISTS (
    SELECT 1 FROM \"JournalLine\" l WHERE l.\"journalEntryId\"=je.id AND l.\"entityType\"='$T'
    AND NOT EXISTS (SELECT 1 FROM \"$TT\" r WHERE r.id=l.\"entityId\"))")
  if [ "${N:-0}" != "0" ]; then
    PX "DELETE FROM \"JournalEntry\" je WHERE EXISTS (
      SELECT 1 FROM \"JournalLine\" l WHERE l.\"journalEntryId\"=je.id AND l.\"entityType\"='$T'
      AND NOT EXISTS (SELECT 1 FROM \"$TT\" r WHERE r.id=l.\"entityId\"))" >/dev/null
    ORPHAN_JES=$((ORPHAN_JES + N))
    echo "  $T → $TT: deleted $N JE(s) with dangling entityIds"
  fi
done
echo "  $ORPHAN_JES orphaned JE(s) removed"

echo "═══ 2c-0. Attribution-less stock movements (empty refType — fixture-era only) ═══"
# Every service path sets refType (STOCK_COUNT, MANUAL_ADJUSTMENT, …); an
# empty ref can only come from a raw fixture insert. Baseline FIXTURE-refType
# opening movements are kept — deleting them while API outs remain is what
# produced the net-negative movement-log pairs.
N=$(P "SELECT count(*) FROM \"StockMovement\" WHERE \"refType\" IS NULL OR \"refType\"=''")
if [ "${N:-0}" != "0" ]; then
  PX "DELETE FROM \"StockMovement\" WHERE \"refType\" IS NULL OR \"refType\"=''" | tail -1
  echo "  $N attribution-less movement(s) removed"
fi

echo "═══ 2c. Orphaned stock movements (refs to deleted fixture docs) ═══"
# The movement log is append-only for real data, but refs pointing at rows
# deleted above are fixture history, not business history. refType maps to a
# table name in PascalCase words (MATERIAL_SALE → MaterialSale).
for pair in "STOCK_TRANSFER:StockTransfer" "MATERIAL_SALE:MaterialSale" \
  "MATERIAL_SALE_RETURN:MaterialSaleReturn" "MATERIAL_ISSUE:MaterialIssue" \
  "PURCHASE_ORDER:PurchaseOrder" "SCRAP_GENERATION:ScrapGeneration" \
  "STOCK_COUNT:StockCount" \
; do
  RT="${pair%%:*}"; TT="${pair##*:}"
  N=$(P "SELECT count(*) FROM \"StockMovement\" m WHERE m.\"refType\"='$RT'
    AND m.\"refId\" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM \"$TT\" r WHERE r.id=m.\"refId\")")
  if [ "${N:-0}" != "0" ]; then
    PX "DELETE FROM \"StockMovement\" m WHERE m.\"refType\"='$RT'
      AND m.\"refId\" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM \"$TT\" r WHERE r.id=m.\"refId\")" | tail -1
    echo "  $RT → $TT: $N orphaned movement(s) removed"
  fi
done

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

echo "═══ 3c. Fixture baseline GL reconcile (Dr/Cr 1300 ↔ 3000) ═══"
# The verify suite's persistent fixture stock is real physical stock — every
# service-posted draw (issue/sale/transfer) hits GL 1300, so the baseline needs
# an opening entry or the account goes net-credit. Post one marked JE per
# company holding fixture movements for the exact residual gap; the
# 'vfy-opening-stock' sourceId is exempted from §1 so the baseline persists.
for C in $(P "SELECT DISTINCT loc.\"companyId\" FROM \"StockMovement\" m JOIN \"StockLocation\" loc ON loc.id=coalesce(m.\"toLocationId\",m.\"fromLocationId\") WHERE m.\"refType\"='FIXTURE'"); do
  MAT=$(P "SELECT m.\"materialId\" FROM \"StockMovement\" m JOIN \"StockLocation\" loc ON loc.id=coalesce(m.\"toLocationId\",m.\"fromLocationId\") WHERE m.\"refType\"='FIXTURE' AND loc.\"companyId\"='$C' LIMIT 1")
  GAP=$(P "SELECT ((
    SELECT coalesce(sum(v.\"balanceValueAfter\"),0) FROM (
      SELECT DISTINCT ON (m.\"materialId\", m.\"locationId\") m.\"balanceValueAfter\" FROM (
        SELECT id,\"materialId\",\"toLocationId\" AS \"locationId\",\"balanceValueAfter\",timestamp FROM \"StockMovement\" WHERE \"toLocationId\" IS NOT NULL
        UNION ALL
        SELECT id,\"materialId\",\"fromLocationId\" AS \"locationId\",\"balanceValueAfter\",timestamp FROM \"StockMovement\" WHERE \"fromLocationId\" IS NOT NULL
      ) m JOIN \"StockLocation\" loc ON loc.id=m.\"locationId\" AND loc.\"companyId\"='$C' AND loc.\"deletedAt\" IS NULL
      ORDER BY m.\"materialId\", m.\"locationId\", m.timestamp DESC, m.id DESC) v)
    + (SELECT coalesce(sum(l.qty*coalesce(l.\"unitCostAtSource\",0)),0) FROM \"StockTransferLine\" l JOIN \"StockTransfer\" t ON t.id=l.\"stockTransferId\" JOIN \"StockLocation\" s ON s.id=t.\"fromLocationId\" WHERE t.status='IN_TRANSIT' AND s.\"companyId\"='$C')
    - (SELECT coalesce(sum(jl.debit-jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" AND je.\"companyId\"='$C' AND je.status='POSTED' JOIN \"GlAccount\" ga ON ga.id=jl.\"accountId\" WHERE ga.code='1300')
  )::numeric(14,2)")
  if [ -n "$GAP" ] && python3 -c "import sys; sys.exit(0 if abs(float('${GAP:-0}'))>1 else 1)"; then
    ACC1300=$(P "SELECT id FROM \"GlAccount\" WHERE code='1300' AND \"companyId\"='$C' LIMIT 1")
    ACC3000=$(P "SELECT id FROM \"GlAccount\" WHERE code='3000' AND \"companyId\"='$C' LIMIT 1")
    if [ -n "$ACC1300" ] && [ -n "$ACC3000" ] && [ -n "$MAT" ]; then
      JEX="vfyre$RANDOM$RANDOM"; JL1="vfyre$RANDOM$RANDOM"; JL2="vfyre$RANDOM$RANDOM"; ABS=${GAP#-}
      PX "INSERT INTO \"JournalEntry\" (id,\"entryNumber\",\"companyId\",\"entryDate\",memo,\"sourceType\",\"sourceId\",\"createdAt\",\"updatedAt\") VALUES ('$JEX','WF-OPEN-$RANDOM','$C',now(),'wf verify fixture opening stock','FIXTURE','vfy-opening-stock-$RANDOM',now(),now())" >/dev/null
      if python3 -c "import sys; sys.exit(0 if float('${GAP:-0}')>0 else 1)"; then
        PX "INSERT INTO \"JournalLine\" (id,\"journalEntryId\",\"accountId\",\"entityType\",\"entityId\",debit,credit) VALUES ('$JL1','$JEX','$ACC1300','Material','$MAT',$ABS,0),('$JL2','$JEX','$ACC3000','Company','$C',0,$ABS)" >/dev/null
      else
        PX "INSERT INTO \"JournalLine\" (id,\"journalEntryId\",\"accountId\",\"entityType\",\"entityId\",debit,credit) VALUES ('$JL1','$JEX','$ACC3000','Company','$C',$ABS,0),('$JL2','$JEX','$ACC1300','Material','$MAT',0,$ABS)" >/dev/null
      fi
      echo "  $C: posted fixture-opening JE ₹$ABS (gap now 0)"
    fi
  else
    echo "  $C: already reconciled (gap ${GAP:-0})"
  fi
done

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
