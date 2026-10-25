#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# CLP milestone chain — a construction-linked buyer payment falls due
# when the measurement that completes its slab is approved.
#
#   1. Sell a fresh unit on a live project (real sale API)
#   2. Create a slab milestone (WBS activity) linked to a BOQ line
#   3. Generate the buyer's CLP schedule, first installment on that slab
#   4. Record the slab measurement → verify → approve (cumulative = BOQ qty)
#   5. Assert: the milestone is 100%, and the linked installment is DUE
#      while the later installment stays PENDING
#
# Dev/staging only — creates fixture rows marked "wf clp verify".
# Usage: BASE=http://localhost:3000 ./scripts/verify-clp-milestone-chain.sh
# ─────────────────────────────────────────────────────────────
set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
id_of() { grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4; }
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  PASS $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }

C="cmtv3x4t50000vlp0b23vdtxe"                       # SRG REALCON (demo session company)
PROJ="cmtwhwzer000pvlt3cth8e8qo"                    # Apex Center
CUST=$(P "SELECT id FROM \"Customer\" WHERE \"companyId\"='$C' AND \"deletedAt\" IS NULL LIMIT 1")
VERIFIER=$(P "SELECT id FROM \"User\" WHERE id<>'tenantb-user' AND role='OWNER' LIMIT 1")
TS=$(date +%s)

# A fresh 100-unit BOQ line for this run, so earlier runs' measurements never
# exhaust it and the slab can be taken to exactly 100%.
req POST boq/items "{\"projectId\":\"$PROJ\",\"type\":\"LINE_ITEM\",\"serialNo\":\"WF-CLP-$TS\",\"description\":\"wf clp verify — slab quantity\",\"unit\":\"cum\",\"estimatedQty\":100,\"rate\":10000}" >/dev/null
BOQ=$(P "SELECT id FROM \"BoqItem\" WHERE \"projectId\"='$PROJ' AND \"serialNo\"='WF-CLP-$TS'")
REMAIN=100
echo "Scenario: fresh BOQ line $BOQ (100 cum) — measuring all of it completes the slab"

echo "1. Sell a fresh unit"
req POST built-units "{\"projectId\":\"$PROJ\",\"unitType\":\"BHK_2\",\"unitNumber\":\"wf clp verify $TS\",\"area\":1000}" >/dev/null
UNIT=$(P "SELECT id FROM \"BuiltUnit\" WHERE \"projectId\"='$PROJ' AND \"unitNumber\"='wf clp verify $TS'")
[ -n "$UNIT" ] && ok "unit created ($UNIT)" || bad "unit create failed"
# New units start PLANNED; a fixture unit is made saleable directly (as the other chain scripts do).
P "UPDATE \"BuiltUnit\" SET status='AVAILABLE' WHERE id='$UNIT'" >/dev/null
SALE_RES=$(req POST sales "{\"assetType\":\"BUILT_UNIT\",\"builtUnitId\":\"$UNIT\",\"projectId\":\"$PROJ\",\"customerId\":\"$CUST\",\"salePrice\":5000000,\"gstRate\":0,\"notes\":\"wf clp verify\"}")
SALE=$(echo "$SALE_RES" | grep -o '"saleId":"[^"]*"' | cut -d'"' -f4)
[ -n "$SALE" ] && ok "sale created ($SALE)" || { bad "sale create failed: $SALE_RES"; exit 1; }

echo "2. Slab milestone linked to the BOQ line"
NODE=$(req POST wbs/nodes "{\"projectId\":\"$PROJ\",\"boqItemId\":\"$BOQ\",\"type\":\"ACTIVITY\",\"code\":\"WF-CLP-$TS\",\"name\":\"wf clp verify — first slab\"}" | id_of)
[ -n "$NODE" ] && ok "milestone created ($NODE)" || bad "milestone create failed"

echo "3. Buyer CLP schedule: 40% on the slab, 60% on completion"
NET=4950000                                         # price 5,000,000 − 1% 194-IA TDS withheld by buyer
SCHED=$(req POST "sales/$SALE/schedule" "{\"type\":\"CLP\",\"items\":[{\"installmentNo\":1,\"description\":\"wf first slab\",\"percentage\":40,\"amount\":$((NET*40/100)),\"wbsNodeId\":\"$NODE\"},{\"installmentNo\":2,\"description\":\"wf completion\",\"percentage\":60,\"amount\":$((NET*60/100)),\"wbsNodeId\":null}]}")
echo "$SCHED" | grep -q '"error"' && bad "schedule rejected: $SCHED" || ok "CLP schedule created"
ITEM1=$(P "SELECT psi.id FROM \"PaymentScheduleItem\" psi JOIN \"PaymentSchedule\" ps ON ps.id=psi.\"paymentScheduleId\" WHERE ps.\"assetSaleId\"='$SALE' AND psi.\"installmentNo\"=1")
ITEM2=$(P "SELECT psi.id FROM \"PaymentScheduleItem\" psi JOIN \"PaymentSchedule\" ps ON ps.id=psi.\"paymentScheduleId\" WHERE ps.\"assetSaleId\"='$SALE' AND psi.\"installmentNo\"=2")
[ "$(P "SELECT status FROM \"PaymentScheduleItem\" WHERE id='$ITEM1'")" = "PENDING" ] && ok "slab installment starts PENDING" || bad "slab installment not PENDING"

echo "4. Measure, verify, approve the slab"
MB=$(req POST mb-entries "{\"projectId\":\"$PROJ\",\"boqItemId\":\"$BOQ\",\"wbsNodeId\":\"$NODE\",\"measuredQty\":$REMAIN,\"description\":\"wf clp verify — slab measurement\"}" | id_of)
[ -n "$MB" ] && ok "measurement recorded ($MB)" || { bad "measurement create failed"; exit 1; }
# Verification requires a different person than the measurer. The demo session
# measured it, so hand the measurement to another approver — the same
# separation-of-duties data the real workflow would have.
P "UPDATE \"MeasurementBookEntry\" SET \"measuredById\"='$VERIFIER' WHERE id='$MB'" >/dev/null
V=$(req PATCH "mb-entries/$MB" '{"action":"verify"}')
echo "$V" | grep -q '"status":"VERIFIED"' && ok "measurement verified" || bad "verify failed: $V"
A=$(req PATCH "mb-entries/$MB" '{"action":"approve"}')
echo "$A" | grep -q '"status":"APPROVED"' && ok "measurement approved" || bad "approve failed: $A"

echo "5. Money assertions"
[ "$(P "SELECT round(\"progressPct\"::numeric,0) FROM \"WbsNode\" WHERE id='$NODE'")" = "100" ] && ok "slab milestone reached 100%" || bad "slab milestone not 100%"
[ "$(P "SELECT status FROM \"PaymentScheduleItem\" WHERE id='$ITEM1'")" = "DUE" ] && ok "slab installment is now DUE (buyer can be demanded)" || bad "slab installment not DUE"
[ "$(P "SELECT status FROM \"PaymentScheduleItem\" WHERE id='$ITEM2'")" = "PENDING" ] && ok "completion installment still PENDING" || bad "completion installment changed unexpectedly"
[ "$(P "SELECT count(*) FROM \"AuditLog\" WHERE action='CLP_DEMAND_GENERATED' AND \"entityId\"='$NODE'")" -ge 1 ] && ok "CLP demand logged in audit trail" || bad "no CLP audit entry"

echo "6. Collect the due installment"
D=$(req POST "payment-schedules/items/$ITEM1/demand" '{}')
echo "$D" | grep -q '"notificationLogId"' && ok "demand sent to buyer" || bad "demand failed: $D"
OVER=$(req POST "payment-schedules/items/$ITEM1/pay" "{\"amount\":$((NET*40/100*2)),\"paymentMode\":\"NEFT\"}")
echo "$OVER" | grep -q 'exceeds installment' && ok "overpayment refused" || bad "overpayment not refused: $OVER"
PART=$(req POST "payment-schedules/items/$ITEM1/pay" '{"amount":500000,"paymentMode":"NEFT","reference":"UTR-WF-CLP"}')
echo "$PART" | grep -q '"status":"PARTIAL"' && ok "partial payment → PARTIAL" || bad "partial payment failed: $PART"
REST=$(P "SELECT \"totalAmount\"-\"paidAmount\" FROM \"PaymentScheduleItem\" WHERE id='$ITEM1'")
FULL=$(req POST "payment-schedules/items/$ITEM1/pay" "{\"amount\":$REST,\"paymentMode\":\"NEFT\"}")
echo "$FULL" | grep -q '"status":"PAID"' && ok "balance paid → PAID" || bad "final payment failed: $FULL"
PAYS=$(P "SELECT count(*) FROM \"AssetSalePayment\" WHERE \"assetSaleId\"='$SALE'")
JE=$(P "SELECT count(DISTINCT je.id) FROM \"JournalEntry\" je JOIN \"JournalLine\" jl ON jl.\"journalEntryId\"=je.id JOIN \"GlAccount\" ga ON ga.id=jl.\"accountId\" WHERE jl.\"entityType\"='AssetSale' AND jl.\"entityId\"='$SALE' AND je.\"sourceType\"='ASSET_SALE_DEPOSIT' AND ga.code='1060' AND jl.debit>0")
[ "${JE:-0}" -ge "${PAYS:-1}" ] && ok "each of $PAYS collections posted to the GL (Dr Bank / Cr Customer deposits)" || bad "GL postings missing (payments $PAYS, entries ${JE:-0})"

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
