#!/usr/bin/env bash
# Stock valuation chain — moving-average cost repricing + issue-at-MAC.
#
#   MAC after receipt = (oldQty × oldMAC + recvQty × recvCost) / (oldQty + recvQty)
#   Issues draw at the MAC snapshot; the issue's unitCost records it.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-stock-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
SUP="cmv0q7nhr005yvlt79m5jwk7q"                   # Apex Steel
PROJ="cmtwhwzer000pvlt3cth8e8qo"                  # apex center
LOC="cmv0q8a4h006avlt72rifonze"                   # Central Store (COMPANY_WAREHOUSE)
MAT="cmv0qadjq006qvlt7o4zo7eae"                   # seeded material

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
reqRetry() { local r i; for i in 1 2 3 4; do r=$(req "$@"); echo "$r" | grep -qi "conflict" || break; sleep 2; done; echo "$r"; }
expect_num() {
  got=$(P "$2")
  ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.02")
  [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
expect() {
  got=$(P "SELECT $4::text FROM \"$2\" WHERE id='$3'")
  [ "$got" = "$5" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $5 got ${got:-<none>}"; }
}
uid() { echo "vfy$(date +%s)$RANDOM"; }

Q0=$(P "SELECT coalesce(qty,0) FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
M0=$(P "SELECT coalesce(\"movingAvgCost\",0) FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
echo "  baseline: qty=$Q0 mac=$M0"
# New MAC after receiving 10 @ ₹200 — computed in SQL for precision.
NEWMAC=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(($Q0::numeric * $M0::numeric + 10 * 200) / ($Q0::numeric + 10), 4)")
NEWQTY=$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric + 10")
echo "  expected after receipt: qty=$NEWQTY mac=$NEWMAC"

echo "════════ 1. PO 10 × ₹200 → receive → MAC repriced ════════"
PO=$(uid); PL=$(uid)
P "INSERT INTO \"PurchaseOrder\" (id,\"poNumber\",\"supplierId\",\"procurementScope\",\"companyId\",\"destinationLocationId\",status,\"updatedAt\",\"createdAt\") VALUES ('$PO','PO-MAC-$RANDOM','$SUP','COMPANY','$C','$LOC','DRAFT',now(),now())"
P "INSERT INTO \"PurchaseOrderLine\" (id,\"purchaseOrderId\",\"materialId\",\"qtyOrdered\",\"unitCost\") VALUES ('$PL','$PO','$MAT',10,200)"
reqRetry PATCH "purchase-orders/$PO" '{"action":"approve"}' >/dev/null
reqRetry PATCH "purchase-orders/$PO" '{"action":"order"}' >/dev/null
r=$(reqRetry POST "goods-receipts" "{\"purchaseOrderId\":\"$PO\",\"locationId\":\"$LOC\",\"lines\":[{\"purchaseOrderLineId\":\"$PL\",\"materialId\":\"$MAT\",\"qtyReceived\":10,\"unitCost\":200}]}")
echo "$r" | grep -q '"ok":true' || echo "  · grn: ${r:0:140}"
expect_num "qty repriced" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$NEWQTY"
expect_num "MAC repriced" "SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$NEWMAC"

echo "════════ 2. issue 3 units → drawn at MAC snapshot ════════"
r=$(reqRetry POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":3}]}")
ISS=$(echo "$r" | grep -oE '"id":"[^"]+"' | head -1 | cut -d'"' -f4)
ISSQTY=$(psql -h localhost -d nirman_inventory -tAc "SELECT $NEWQTY::numeric - 3")
expect_num "qty after issue" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$ISSQTY"
expect_num "MAC unchanged after issue" "SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$NEWMAC"
# Issue movements are ISSUE_TO_PROJECT and snapshot the (rounded) MAC at issue.
expect_num "issue priced at MAC" "SELECT \"unitCost\" FROM \"StockMovement\" WHERE \"movementType\"='ISSUE_TO_PROJECT' ORDER BY \"timestamp\" DESC LIMIT 1" "$NEWMAC"

echo "════════ 3. over-issue guard ════════"
r=$(reqRetry POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":999999}]}")
echo "$r" | grep -qiE "insufficient|exceeds|error|enough" && { PASS=$((PASS+1)); echo "  PASS over-issue blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL over-issue accepted: ${r:0:140}"; }
expect_num "qty unchanged" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$ISSQTY"

echo "════════ 4. ledger consistency — latest movement balanceAfter matches qty × MAC ════════"
expect_num "movement balance consistent" "SELECT \"balanceAfter\" FROM \"StockMovement\" WHERE \"materialId\"='$MAT' AND \"toLocationId\" IS NULL ORDER BY \"timestamp\" DESC LIMIT 1" "$ISSQTY"
expect_num "stored value ≈ qty×MAC (rounded)" "SELECT qty * \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT round($ISSQTY::numeric * round($NEWMAC::numeric,2), 2)")"

echo; echo "════════ RESULT: $PASS passed, $FAIL failed ════════"
[ "$FAIL" -eq 0 ]
