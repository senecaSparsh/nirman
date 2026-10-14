#!/usr/bin/env bash
# Stock-count → reconciliation chain verification — physical count drives
# real adjustments + GL:
#   create(DRAFT, variance snapshot) → confirm(COUNTED) → reconcile:
#     +variance → ADJUSTMENT_IN at MAC, Dr 1300 / Cr 6000 (gain)
#     −variance → ADJUSTMENT_OUT,          Dr 5500 / Cr 1300 (loss)
#     zero      → no movement
#   staleness: any movement at the location after the count → 409 recount
#   order: reconcile before confirm refused, double-confirm refused.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-stock-count-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
LOC="cmv0q8a4h006avlt72rifonze"                      # Central Store - Agra
WIR="cmv0qadjq006qvlt7o4zo7eae"                      # WIRE-BIND
SND="cmv0qabq9006hvlt7eyfga17r"                      # SAND-COARSE
AGG="cmv0qacbt006kvlt7yyxfaahr"                      # AGG-20MM

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

WQ=$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$WIR'")
SQ=$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$SND'")
AQ=$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$AGG'")
WMAC=$(P "SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$WIR'")
SMAC=$(P "SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$SND'")
echo "  baseline: WIRE=$WQ@$WMAC SAND=$SQ@$SMAC AGG=$AQ"
GAIN=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(3*$WMAC::numeric,2)")
LOSS=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(2*$SMAC::numeric,2)")

echo "════════ 1. count → DRAFT with variances ════════"
# WIRE +3 (gain), SAND −2 (loss), AGG exact (zero)
r=$(req POST "stock-counts" "{\"locationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$WIR\",\"countedQty\":$(psql -h localhost -d nirman_inventory -tAc "SELECT $WQ::numeric + 3")},{\"materialId\":\"$SND\",\"countedQty\":$(psql -h localhost -d nirman_inventory -tAc "SELECT $SQ::numeric - 2")},{\"materialId\":\"$AGG\",\"countedQty\":$AQ}]}")
CNT=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$CNT" ] && { PASS=$((PASS+1)); echo "  count created $CNT"; } || { FAIL=$((FAIL+1)); echo "  FAIL create: ${r:0:140}"; }
expect_num "WIRE variance +3" "SELECT variance FROM \"StockCountLine\" WHERE \"stockCountId\"='$CNT' AND \"materialId\"='$WIR'" 3
expect_num "SAND variance −2" "SELECT variance FROM \"StockCountLine\" WHERE \"stockCountId\"='$CNT' AND \"materialId\"='$SND'" -2
expect_cnt "status DRAFT" "SELECT CASE WHEN status='DRAFT' THEN 1 ELSE 0 END FROM \"StockCount\" WHERE id='$CNT'" 1

echo "════════ 2. order guards ════════"
r=$(req PATCH "stock-counts/$CNT" '{"action":"reconcile"}')
expect_refused "reconcile before confirm" "$r"
r=$(req PATCH "stock-counts/$CNT" '{"action":"confirm"}')
echo "$r" | grep -q '"ok":true\|COUNTED' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  confirm → ${r:0:90}"
r=$(req PATCH "stock-counts/$CNT" '{"action":"confirm"}')
expect_refused "double confirm" "$r"

echo "════════ 3. reconcile → movements + GL ════════"
r=$(req PATCH "stock-counts/$CNT" '{"action":"reconcile"}')
echo "$r" | grep -q '"ok":true\|RECONCILED' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  reconcile → ${r:0:90}"
expect_cnt "status RECONCILED" "SELECT CASE WHEN status='RECONCILED' THEN 1 ELSE 0 END FROM \"StockCount\" WHERE id='$CNT'" 1
expect_cnt "+3 ADJUSTMENT_IN" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='ADJUSTMENT_IN' AND \"refType\"='STOCK_COUNT' AND \"refId\"='$CNT' AND \"materialId\"='$WIR'" 1
expect_num "ADJ_IN at MAC" "SELECT \"unitCost\" FROM \"StockMovement\" WHERE \"movementType\"='ADJUSTMENT_IN' AND \"refId\"='$CNT' LIMIT 1" "$WMAC"
expect_cnt "−2 ADJUSTMENT_OUT" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='ADJUSTMENT_OUT' AND \"refType\"='STOCK_COUNT' AND \"refId\"='$CNT' AND \"materialId\"='$SND'" 1
expect_cnt "zero-variance line: no movement" "SELECT count(*) FROM \"StockMovement\" WHERE \"refType\"='STOCK_COUNT' AND \"refId\"='$CNT' AND \"materialId\"='$AGG'" 0
expect_num "new WIRE qty = counted" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$WIR'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $WQ::numeric + 3")"
expect_num "new SAND qty = counted" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$SND'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $SQ::numeric - 2")"

echo "════════ 4. GL legs ════════"
expect_num "gain Dr 1300" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='STOCK_ADJUSTMENT' AND je.\"sourceId\"='$CNT' AND a.code='1300'" "$GAIN"
expect_num "gain Cr 6000" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='STOCK_ADJUSTMENT' AND je.\"sourceId\"='$CNT' AND a.code='6000'" "$GAIN"
expect_num "loss Dr 5500" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='STOCK_ADJUSTMENT' AND je.\"sourceId\"='$CNT' AND a.code='5500'" "$LOSS"
expect_num "loss Cr 1300" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='STOCK_ADJUSTMENT' AND je.\"sourceId\"='$CNT' AND a.code='1300'" "$LOSS"
expect_num "entry balanced" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceType\"='STOCK_ADJUSTMENT' AND je.\"sourceId\"='$CNT'" 0

echo "════════ 5. staleness: movement after count kills reconcile ════════"
r=$(req POST "stock-counts" "{\"locationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$WIR\",\"countedQty\":$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$WIR'")}]}")
CNT2=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
req PATCH "stock-counts/$CNT2" '{"action":"confirm"}' >/dev/null
# move stock at the location between confirm and reconcile
req POST "issue-materials" "{\"projectId\":\"cmtwhwzer000pvlt3cth8e8qo\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$WIR\",\"qty\":1}]}" >/dev/null
r=$(req PATCH "stock-counts/$CNT2" '{"action":"reconcile"}')
expect_refused "reconcile after intervening movement" "$r"
echo "$r" | grep -qi "stale\|recount" && { PASS=$((PASS+1)); echo "  PASS stale message explains recount"; } || { FAIL=$((FAIL+1)); echo "  FAIL stale message: ${r:0:100}"; }
expect_cnt "stale count stays COUNTED" "SELECT CASE WHEN status='COUNTED' THEN 1 ELSE 0 END FROM \"StockCount\" WHERE id='$CNT2'" 1

echo "════════════════════════════════════════"
echo "stock-count chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
