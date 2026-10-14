#!/usr/bin/env bash
# Material-sale → return chain verification — proves the fd400362 fix
# live: a PARTIAL return reverses only the returned fraction of revenue,
# GST, and COGS — never the whole sale's journals.
#
#   sale:  10 units @ ₹150 +18% GST → Dr AR 1770 / Cr Revenue 1500 /
#          Cr OutputGST 270 / Dr COGS / Cr Inv at MAC
#   return 3 units → ADJUSTMENT_IN at ORIGINAL unitCost (sale basis),
#          Dr Revenue 450 / Dr OutputGST 81 / Cr AR 531
#          Dr Inventory 3×MAC / Cr COGS 3×MAC
#   status → PARTIALLY_RETURNED; over-return refused; second return of
#          remaining 7 → RETURNED.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-material-sale-return-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                       # SRG REALCON
LOC="cmv0q8a4h006avlt72rifonze"                     # Central Store - Agra
MAT="cmv0qadjq006qvlt7o4zo7eae"                     # WIRE-BIND
CUST="cmtwi53250001vljm6ru892z6"                    # Sparsh

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*|*'"id"'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

Q0=$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
MAC=$(P "SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
COGS=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(10*$MAC::numeric,2)")
RCOGS=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(3*$MAC::numeric,2)")
echo "  baseline: qty=$Q0 mac=$MAC  (sale 10@150+18%GST, COGS at MAC=$COGS)"

echo "════════ 1. material sale ════════"
r=$(req POST "material-sales" "{\"customerId\":\"$CUST\",\"lines\":[{\"materialId\":\"$MAT\",\"locationId\":\"$LOC\",\"qty\":10,\"unitPrice\":150,\"gstRate\":18}]}")
SALE=$(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or d.get('materialSale',{}).get('id',''))" 2>/dev/null)
[ -n "$SALE" ] && { PASS=$((PASS+1)); echo "  sale created $SALE"; } || { FAIL=$((FAIL+1)); echo "  FAIL sale: ${r:0:140}"; }
SL=$(P "SELECT id FROM \"MaterialSaleLine\" WHERE \"materialSaleId\"='$SALE' LIMIT 1")
expect_num "stock −10" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric - 10")"
expect_cnt "SALE movement" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='SALE' AND \"refType\"='MATERIAL_SALE' AND \"refId\"='$SALE'" 1
expect_num "sale Dr AR 1770" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code='1200'" 1770
expect_num "sale Cr Revenue 1500" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code='4000'" 1500
expect_num "sale Cr OutputGST 270" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code='2100'" 270
expect_num "sale Dr COGS = MAC" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_COGS' AND je.\"sourceId\"='$SALE' AND a.code='5000'" "$COGS"

echo "════════ 2. partial return of 3 — proportional reversal only ════════"
r=$(req POST "material-sales/$SALE/returns" "{\"lines\":[{\"materialSaleLineId\":\"$SL\",\"qty\":3}]}")
RET=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$RET" ] && { PASS=$((PASS+1)); echo "  return created $RET"; } || { FAIL=$((FAIL+1)); echo "  FAIL return: ${r:0:140}"; }
expect_num "stock +3" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric - 7")"
expect_cnt "return ADJUSTMENT_IN" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='ADJUSTMENT_IN' AND \"refType\"='MATERIAL_SALE_RETURN' AND \"refId\"='$RET'" 1
# CN entry: reverses 3/10 of revenue + GST
expect_num "CN Dr Revenue 450" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_RETURN' AND je.\"sourceId\"='$RET' AND a.code='4000'" 450
expect_num "CN Dr OutputGST 81" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_RETURN' AND je.\"sourceId\"='$RET' AND a.code='2100'" 81
expect_num "CN Cr AR 531" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_RETURN' AND je.\"sourceId\"='$RET' AND a.code='1200'" 531
# COGS reversal: only the returned fraction
expect_num "COGS-rev Dr Inv 3×MAC" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_RETURN_COGS' AND je.\"sourceId\"='$RET' AND a.code='1300'" "$RCOGS"
expect_num "COGS-rev Cr COGS 3×MAC" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_RETURN_COGS' AND je.\"sourceId\"='$RET' AND a.code='5000'" "$RCOGS"
# the fd400362 bug signature: NO full-sale _REVERSAL entries on this ACTIVE sale
expect_cnt "no full-sale reversal on ACTIVE sale" "SELECT count(*) FROM \"JournalEntry\" je WHERE je.\"sourceId\"='$SALE' AND je.\"sourceType\" LIKE '%_REVERSAL' AND je.status='POSTED'" 0
expect_cnt "status PARTIALLY_RETURNED" "SELECT CASE WHEN status='PARTIALLY_RETURNED' THEN 1 ELSE 0 END FROM \"MaterialSale\" WHERE id='$SALE'" 1
# cancel after returns would double-restore stock + double-reverse journals
r=$(req PATCH "material-sales/$SALE" '{"action":"cancel"}')
expect_refused "cancel a partially-returned sale" "$r"

echo "════════ 3. over-return refused, full return completes ════════"
r=$(req POST "material-sales/$SALE/returns" "{\"lines\":[{\"materialSaleLineId\":\"$SL\",\"qty\":8}]}")
expect_refused "returning 8 when only 7 left" "$r"
r=$(req POST "material-sales/$SALE/returns" "{\"lines\":[{\"materialSaleLineId\":\"$SL\",\"qty\":7}]}")
RET2=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$RET2" ] && { PASS=$((PASS+1)); echo "  second return $RET2"; } || { FAIL=$((FAIL+1)); echo "  FAIL 2nd return: ${r:0:120}"; }
expect_num "stock back to baseline" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$Q0"
expect_cnt "status RETURNED" "SELECT CASE WHEN status='RETURNED' THEN 1 ELSE 0 END FROM \"MaterialSale\" WHERE id='$SALE'" 1
# full revenue reversal across both returns
expect_num "total revenue reversed = 1500" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_RETURN' AND je.\"sourceId\" IN ('$RET','$RET2') AND a.code='4000'" 1500
expect_num "total COGS reversed = full" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE_RETURN_COGS' AND je.\"sourceId\" IN ('$RET','$RET2') AND a.code='1300'" "$COGS"
# AR net for this sale should now be zero
expect_num "net AR for sale = 0" "SELECT COALESCE(SUM(jl.debit)-SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceId\" IN ('$SALE','$RET','$RET2') AND a.code='1200' AND je.status='POSTED'" 0

echo "════════════════════════════════════════"
echo "material-sale-return chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
