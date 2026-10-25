#!/usr/bin/env bash
# Procurement chain verification — PO → GRN → 3-way match → payment → GL.
# Asserts quantities, statuses, stock movements, match verdicts and the
# journal entry (Dr AP / Cr Cash / Cr TDS Payable), not just status flips.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-procurement-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
SUP="vfypc$(date +%s)"                            # fresh fixture supplier — deterministic payable
LOC="cmv0q8a4h006avlt72rifonze"                   # Central Store (COMPANY_WAREHOUSE — required for COMPANY-scope POs)
MAT="cmv0qadjq006qvlt7o4zo7eae"                   # material A
MAT2=$(P "SELECT id FROM \"Material\" WHERE \"companyId\"='$C' AND id<>'$MAT' AND \"deletedAt\" IS NULL LIMIT 1")

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
reqRetry() { local r i; for i in 1 2 3 4; do r=$(req "$@"); echo "$r" | grep -qi "conflict" || break; sleep 2; done; echo "$r"; }
expect() {
  got=$(P "SELECT $4::text FROM \"$2\" WHERE id='$3'")
  [ "$got" = "$5" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $5 got ${got:-<none>}"; }
}
expect_num() {
  got=$(P "$2")
  ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.02")
  [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
uid() { echo "vfy$(date +%s)$RANDOM"; }

echo "════════ 0. stock baseline ════════"
QTY0=$(P "SELECT coalesce(sum(qty),0) FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
echo "  site $MAT baseline qty: $QTY0"

echo "════════ 1. PO → approve → order ════════"
P "INSERT INTO \"Supplier\" (id,\"companyId\",name,\"updatedAt\",\"createdAt\") VALUES ('$SUP','$C','wf procurement supplier',now(),now())"
PO=$(uid); L1=$(uid); L2=$(uid)
P "INSERT INTO \"PurchaseOrder\" (id,\"poNumber\",\"supplierId\",\"procurementScope\",\"companyId\",\"destinationLocationId\",status,\"updatedAt\",\"createdAt\") VALUES ('$PO','PO-CH-$RANDOM','$SUP','COMPANY','$C','$LOC','DRAFT',now(),now())"
P "INSERT INTO \"PurchaseOrderLine\" (id,\"purchaseOrderId\",\"materialId\",\"qtyOrdered\",\"unitCost\") VALUES ('$L1','$PO','$MAT',10,100)"
P "INSERT INTO \"PurchaseOrderLine\" (id,\"purchaseOrderId\",\"materialId\",\"qtyOrdered\",\"unitCost\") VALUES ('$L2','$PO','$MAT2',20,50)"
reqRetry PATCH "purchase-orders/$PO" '{"action":"approve"}' >/dev/null
reqRetry PATCH "purchase-orders/$PO" '{"action":"order"}' >/dev/null
expect "po ordered" PurchaseOrder "$PO" '"status"' ORDERED

echo "════════ 2. partial GRN (5 of 10) → PARTIAL + stock +5 ════════"
r=$(reqRetry POST "goods-receipts" "{\"purchaseOrderId\":\"$PO\",\"locationId\":\"$LOC\",\"lines\":[{\"purchaseOrderLineId\":\"$L1\",\"materialId\":\"$MAT\",\"qtyReceived\":5,\"unitCost\":100}]}")
expect "po partial" PurchaseOrder "$PO" '"status"' PARTIAL
GRN1=$(P "SELECT id FROM \"GoodsReceipt\" WHERE \"purchaseOrderId\"='$PO' ORDER BY \"createdAt\" LIMIT 1")
[ -n "$GRN1" ] && { PASS=$((PASS+1)); echo "  PASS grn row $GRN1"; } || { FAIL=$((FAIL+1)); echo "  FAIL grn: ${r:0:140}"; }
expect_num "stock +5" "SELECT coalesce(sum(qty),0) FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT ${QTY0:-0} + 5")"
expect_num "movement qty" "SELECT qty FROM \"StockMovement\" WHERE \"refId\"='$PO' AND \"movementType\"='PURCHASE_RECEIPT' ORDER BY \"timestamp\" DESC LIMIT 1" 5

echo "════════ 3. over-receive guard ════════"
r=$(reqRetry POST "goods-receipts" "{\"purchaseOrderId\":\"$PO\",\"locationId\":\"$LOC\",\"lines\":[{\"purchaseOrderLineId\":\"$L1\",\"materialId\":\"$MAT\",\"qtyReceived\":99,\"unitCost\":100}]}")
echo "$r" | grep -qiE "error|exceed|remaining|ordered" && { PASS=$((PASS+1)); echo "  PASS over-receive blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL over-receive accepted: ${r:0:140}"; }
expect_num "stock unchanged" "SELECT coalesce(sum(qty),0) FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT ${QTY0:-0} + 5")"

echo "════════ 4. remaining GRN → RECEIVED ════════"
# Anti-double-submit: consecutive GRNs on the same PO must be spaced out.
sleep 12
r=$(reqRetry POST "goods-receipts" "{\"purchaseOrderId\":\"$PO\",\"locationId\":\"$LOC\",\"lines\":[{\"purchaseOrderLineId\":\"$L1\",\"materialId\":\"$MAT\",\"qtyReceived\":5,\"unitCost\":100},{\"purchaseOrderLineId\":\"$L2\",\"materialId\":\"$MAT2\",\"qtyReceived\":20,\"unitCost\":50}]}")
echo "$r" | grep -q '"ok":true' || echo "  · grn2 resp: ${r:0:160}"
expect "po received" PurchaseOrder "$PO" '"status"' RECEIVED

echo "════════ 5. invoice 3-way match ════════"
r=$(reqRetry POST "supplier-invoices" "{\"invoiceNumber\":\"INV-CH-$RANDOM\",\"supplierId\":\"$SUP\",\"purchaseOrderId\":\"$PO\",\"invoiceDate\":\"2025-10-01\",\"subtotal\":2000,\"gstAmount\":360,\"totalAmount\":2360,\"lines\":[{\"materialId\":\"$MAT\",\"quantity\":10,\"unitPrice\":100},{\"materialId\":\"$MAT2\",\"quantity\":20,\"unitPrice\":50}]}")
INV=$(echo "$r" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
[ -n "$INV" ] && { PASS=$((PASS+1)); echo "  PASS invoice created"; } || { FAIL=$((FAIL+1)); echo "  FAIL invoice: ${r:0:160}"; }
expect "3-way match" SupplierInvoice "$INV" '"matchStatus"' THREE_WAY_MATCH

echo "════════ 6. mismatched invoice flags variance ════════"
# Invoice qty 11 vs GRN-received 10 → three-way match must flag UNMATCHED.
# Arithmetic stays consistent (subtotal = 11 × 100 = 1100) since invoice
# totals are now validated — the mismatch is qty-over-receipt, not bad math.
r=$(reqRetry POST "supplier-invoices" "{\"invoiceNumber\":\"INV-CH2-$RANDOM\",\"supplierId\":\"$SUP\",\"purchaseOrderId\":\"$PO\",\"invoiceDate\":\"2025-10-02\",\"subtotal\":1100,\"gstAmount\":0,\"totalAmount\":1100,\"lines\":[{\"materialId\":\"$MAT\",\"quantity\":11,\"unitPrice\":100}]}")
INV2=$(echo "$r" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
expect "mismatch flagged" SupplierInvoice "$INV2" '"matchStatus"' UNMATCHED
n=$(P "SELECT count(*) FROM \"SupplierInvoice\" WHERE id='$INV2' AND \"matchNotes\" IS NOT NULL")
[ "${n:-0}" = "1" ] && { PASS=$((PASS+1)); echo "  PASS variance notes recorded"; } || { FAIL=$((FAIL+1)); echo "  FAIL no matchNotes"; }

echo "════════ 6b. payment rules — MATCHED payable, over-pay blocked ════════"
# A THREE_WAY_MATCH invoice is payable without approval — the match IS the gate.
r=$(reqRetry POST "supplier-payments" "{\"supplierId\":\"$SUP\",\"invoiceId\":\"$INV\",\"amount\":111,\"paymentMode\":\"NEFT\",\"referenceNo\":\"UTR-P1-$RANDOM\"}")
echo "$r" | grep -q '"ok":true\|"id"' && { PASS=$((PASS+1)); echo "  PASS matched invoice payable"; } || { FAIL=$((FAIL+1)); echo "  FAIL matched pay: ${r:0:140}"; }
# UNMATCHED invoice must NOT be payable until resolved.
r=$(reqRetry POST "supplier-payments" "{\"supplierId\":\"$SUP\",\"invoiceId\":\"$INV2\",\"amount\":100,\"paymentMode\":\"NEFT\"}")
echo "$r" | grep -qiE "error|UNMATCHED|APPROVED" && { PASS=$((PASS+1)); echo "  PASS unmatched pay blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL unmatched pay accepted: ${r:0:140}"; }
# Over-payment guard: invoice total 2360 − already paid 111 → >2249 must fail.
r=$(reqRetry POST "supplier-payments" "{\"supplierId\":\"$SUP\",\"invoiceId\":\"$INV\",\"amount\":99999,\"paymentMode\":\"NEFT\"}")
echo "$r" | grep -qiE "exceeds|error" && { PASS=$((PASS+1)); echo "  PASS over-pay blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL over-pay accepted: ${r:0:140}"; }

echo "════════ 7. pay remainder → GL (Dr AP / Cr Cash / Cr TDS) ════════"
# Remaining balance 2360 − 111 = 2249, with ₹225 TDS → cash out ₹2,024.
r=$(reqRetry POST "supplier-payments" "{\"supplierId\":\"$SUP\",\"invoiceId\":\"$INV\",\"amount\":2249,\"tdsAmount\":225,\"tdsSection\":\"194C\",\"paymentMode\":\"NEFT\",\"referenceNo\":\"UTR-CH-$RANDOM\"}")
PAY=$(echo "$r" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
[ -n "$PAY" ] && { PASS=$((PASS+1)); echo "  PASS payment $PAY"; } || { FAIL=$((FAIL+1)); echo "  FAIL payment: ${r:0:160}"; }
expect_num "GL: AP debited 2249" "SELECT coalesce(sum(\"debit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='2000' AND je.\"sourceId\"='$PAY'" 2249
expect_num "GL: cash credited 2024" "SELECT coalesce(sum(\"credit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='1000' AND je.\"sourceId\"='$PAY'" 2024
expect_num "GL: TDS credited 225" "SELECT coalesce(sum(\"credit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='2400' AND je.\"sourceId\"='$PAY'" 225
bal=$(P "SELECT coalesce(sum(jl.\"debit\"::numeric)-sum(jl.\"credit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceId\"='$PAY'")
[ "$bal" = "0" ] || bal=$(psql -h localhost -d nirman_inventory -tAc "SELECT round($bal::numeric,2)")
[ "${bal%%.*}" = "0" ] && { PASS=$((PASS+1)); echo "  PASS journal balanced"; } || { FAIL=$((FAIL+1)); echo "  FAIL journal unbalanced: $bal"; }

echo; echo "════════ RESULT: $PASS passed, $FAIL failed ════════"
[ "$FAIL" -eq 0 ]
