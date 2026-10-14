#!/usr/bin/env bash
# Inter-location stock transfer — gate pass → dispatch → partial receipt.
#
# Business rules asserted (quantities and GL, not only status):
#   1. Items cannot leave the gate until the gate pass is approved.
#   2. Dispatch removes the goods from the source exactly once.
#   3. Receipt adds only the quantity that arrived at the destination.
#   4. The shortfall in transit is a loss: removed from the books once, and
#      written off in the GL (Dr Inventory Shrinkage / Cr Inventory).
#   5. A completed transfer cannot be received twice.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-transfer-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
FROM="cmv0q8a4h006avlt72rifonze"                  # Central Store
TO="cmv0q8auu006evlt73x54h619"                    # Apex Center Site Store
MAT="cmv0qadjq006qvlt7o4zo7eae"                   # seeded material

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
reqRetry() { local r i; for i in 1 2 3 4; do r=$(req "$@"); echo "$r" | grep -qi "conflict" || break; sleep 2; done; echo "$r"; }
ok()  { PASS=$((PASS+1)); echo "  PASS $1"; }
bad() { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
qty() { P "SELECT coalesce(qty,0) FROM \"StockLocationItem\" WHERE \"locationId\"='$1' AND \"materialId\"='$MAT'"; }
num_eq() { [ "$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${1:-NULL}::numeric,-999999) - $2::numeric) < 0.005")" = "t" ]; }
check() { # label got want
  num_eq "$2" "$3" && ok "$1 → $2" || bad "$1: want $3 got ${2:-<none>}"
}

echo "════════ 0. baseline ════════"
QS0=$(qty "$FROM"); QD0=$(qty "$TO")
echo "  source=$QS0 dest=$QD0"

echo "════════ 1. create transfer 10u — gate pass auto-created, dispatch must wait ════════"
reqRetry POST "transfers" "{\"fromLocationId\":\"$FROM\",\"toLocationId\":\"$TO\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":10}]}" >/dev/null
TR=$(P "SELECT id FROM \"StockTransfer\" WHERE \"fromLocationId\"='$FROM' AND \"toLocationId\"='$TO' ORDER BY \"createdAt\" DESC LIMIT 1")
[ -n "$TR" ] && ok "transfer created $TR" || { bad "transfer not created"; }
LINE=$(P "SELECT id FROM \"StockTransferLine\" WHERE \"stockTransferId\"='$TR' LIMIT 1")
GP=$(P "SELECT id FROM \"GatePass\" WHERE \"refId\"='$TR' ORDER BY \"createdAt\" DESC LIMIT 1")
[ -n "$GP" ] && ok "gate pass auto-created" || bad "no gate pass for transfer"
r=$(reqRetry PATCH "transfers/$TR" '{"action":"dispatch"}')
echo "$r" | grep -qiE "gate pass|approved" && ok "dispatch refused before gate approval" || bad "dispatch allowed without gate pass: ${r:0:120}"
check "source untouched by refused dispatch" "$(qty "$FROM")" "$QS0"

echo "════════ 2. approve gate → dispatch → source loses 10 once ════════"
reqRetry PATCH "gate-passes/$GP" '{"action":"approve"}' >/dev/null
r=$(reqRetry PATCH "transfers/$TR" '{"action":"dispatch"}')
# Physical exit is recorded on the gate pass after dispatch is on the books.
reqRetry PATCH "gate-passes/$GP" '{"action":"confirmExit"}' >/dev/null
expect_status=$(P "SELECT status FROM \"StockTransfer\" WHERE id='$TR'")
[ "$expect_status" = "IN_TRANSIT" ] && ok "transfer IN_TRANSIT" || bad "transfer status $expect_status: ${r:0:120}"
check "source = start − 10 after dispatch" "$(qty "$FROM")" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $QS0::numeric - 10")"
UCS=$(P "SELECT \"unitCostAtSource\" FROM \"StockTransferLine\" WHERE id='$LINE'")
[ -n "$UCS" ] && ok "source MAC snapshotted on line ($UCS)" || bad "unitCostAtSource missing"

echo "════════ 3a. empty lineReceipts must be refused — not a silent total write-off ════════"
r=$(reqRetry PATCH "transfers/$TR" '{"action":"complete","lineReceipts":[]}')
echo "$r" | grep -qi "empty" && ok "empty lineReceipts refused" || bad "empty lineReceipts accepted: ${r:0:120}"
check "dest unchanged after refused receipt" "$(qty "$TO")" "$QD0"

echo "════════ 3b. receive 8 of 10 — shortfall 2 ════════"
r=$(reqRetry PATCH "transfers/$TR" "{\"action\":\"complete\",\"lineReceipts\":[{\"lineId\":\"$LINE\",\"qtyReceived\":8}]}")
status=$(P "SELECT status FROM \"StockTransfer\" WHERE id='$TR'")
[ "$status" = "COMPLETED" ] && ok "transfer COMPLETED" || bad "not completed ($status): ${r:0:140}"
check "destination = start + 8" "$(qty "$TO")" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $QD0::numeric + 8")"
check "source NOT deducted a second time (start − 10)" "$(qty "$FROM")" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $QS0::numeric - 10")"
check "line records qtyReceived 8" "$(P "SELECT \"qtyReceived\" FROM \"StockTransferLine\" WHERE id='$LINE'")" 8
# Movement ledger must stay replay-consistent: exactly one TRANSFER_OUT of 10
# at source, one TRANSFER_IN of 8 at dest, and NO second deduction for the
# shortage (it was already gone from source — booked to GL only).
check "exactly one TRANSFER_OUT of 10 from source" "$(P "SELECT qty FROM \"StockMovement\" WHERE \"refId\"='$TR' AND \"movementType\"='TRANSFER_OUT'")" 10
check "one TRANSFER_IN of 8 at dest" "$(P "SELECT qty FROM \"StockMovement\" WHERE \"refId\"='$TR' AND \"movementType\"='TRANSFER_IN'")" 8
ADJN=$(P "SELECT count(*) FROM \"StockMovement\" WHERE \"refId\"='$TR' AND \"movementType\"='ADJUSTMENT_OUT'")
[ "$ADJN" = "0" ] && ok "no second source deduction (0 shortage ADJUSTMENT_OUT rows)" || bad "$ADJN shortage ADJUSTMENT_OUT rows — shortage double-deducted"

echo "════════ 4. shortfall written off in GL — Dr Shrinkage (5500) = 2 × source MAC ════════"
check "shrinkage debit = 2 × MAC" "$(P "SELECT coalesce(sum(jl.\"debit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='5500' AND (je.\"sourceId\"='$TR' OR jl.\"entityId\"='$TR')")" "$(psql -h localhost -d nirman_inventory -tAc "SELECT round(2 * $UCS::numeric, 2)")"

echo "════════ 5. completed transfer cannot be received again ════════"
r=$(reqRetry PATCH "transfers/$TR" "{\"action\":\"complete\",\"lineReceipts\":[{\"lineId\":\"$LINE\",\"qtyReceived\":8}]}")
echo "$r" | grep -qi "cannot complete\|status" && ok "second receipt refused" || bad "second receipt accepted: ${r:0:120}"
check "destination unchanged by refused second receipt" "$(qty "$TO")" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $QD0::numeric + 8")"

echo; echo "════════ RESULT: $PASS passed, $FAIL failed ════════"
[ "$FAIL" -eq 0 ]
