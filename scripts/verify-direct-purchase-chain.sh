#!/usr/bin/env bash
# Direct-purchase → AP → cancel verification — PO-less procurement:
#   create: PURCHASE_RECEIPT at unitCost reprices MAC, GL Dr 1300 subtotal /
#     Dr 1400 ITC / Cr 2000 AP total; Supplier.balanceOwed += billAmount
#   cancel: stock back out at original cost, journal reversed,
#     balanceOwed -= billAmount (the AP never existed)
#   guards: cancel twice refused.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-direct-purchase-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
LOC="cmv0q8a4h006avlt72rifonze"                      # Central Store - Agra
MAT="cmv0qacbt006kvlt7yyxfaahr"                      # AGG-20MM
SUP="cmv0q7ni10062vlt7pm0451m7"                      # Ganga Aggregate Works

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

Q0=$(P "SELECT COALESCE((SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'),0)")
BAL0=$(P "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'")
echo "  baseline: qty=$Q0 balanceOwed=$BAL0"

echo "════════ 1. create → receipt + GL + payable ════════"
# 10 units @ ₹40 + 18% GST → subtotal 400, gst 72, bill 472
r=$(req POST "direct-purchases" "{\"supplierId\":\"$SUP\",\"supplierName\":\"Ganga Aggregate Works\",\"locationId\":\"$LOC\",\"notes\":\"wf verify\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":10,\"unitCost\":40,\"gstRate\":18}]}")
DP=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$DP" ] && { PASS=$((PASS+1)); echo "  purchase $DP"; } || { FAIL=$((FAIL+1)); echo "  FAIL create: ${r:0:140}"; }
expect_num "stock +10" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric + 10")"
expect_cnt "PURCHASE_RECEIPT movement" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='PURCHASE_RECEIPT' AND \"refType\"='DIRECT_PURCHASE' AND \"refId\"='$DP'" 1
expect_num "Dr 1300 = 400" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='DIRECT_PURCHASE' AND je.\"sourceId\"='$DP' AND a.code='1300'" 400
expect_num "Dr 1400 ITC = 72" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='DIRECT_PURCHASE' AND je.\"sourceId\"='$DP' AND a.code='1400'" 72
expect_num "Cr AP = 472" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='DIRECT_PURCHASE' AND je.\"sourceId\"='$DP' AND a.code='2000'" 472
expect_num "balanceOwed +472" "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $BAL0::numeric + 472")"

echo "════════ 2. cancel → stock out + reversal + payable back ════════"
r=$(req PATCH "direct-purchases/$DP" '{"action":"cancel"}')
echo "$r" | grep -q '"ok":true\|CANCELLED' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  cancel → ${r:0:90}"
expect_num "stock back to baseline" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$Q0"
expect_cnt "reversal JE" "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='DIRECT_PURCHASE_REVERSAL' AND \"sourceId\"='$DP' AND status='POSTED'" 1
expect_num "balanceOwed restored" "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'" "$BAL0"
expect_num "AP net for purchase = 0" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceId\"='$DP' AND a.code='2000' AND je.status='POSTED'" 0
r=$(req PATCH "direct-purchases/$DP" '{"action":"cancel"}')
expect_refused "double cancel" "$r"

echo "════════ 3. supplier-less spot buy → cash leg, no AP ════════"
# No supplierId → cash-market purchase: Cr Cash (never AP — there is no
# payment path for an unnamed vendor, so AP would sit unpayable forever).
r=$(req POST "direct-purchases" "{\"supplierName\":\"Roadside Aggregate\",\"locationId\":\"$LOC\",\"notes\":\"wf verify\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1,\"unitCost\":100,\"gstRate\":18}]}")
DP2=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$DP2" ] && { PASS=$((PASS+1)); echo "  spot buy $DP2"; } || { FAIL=$((FAIL+1)); echo "  FAIL spot buy: ${r:0:140}"; }
expect_num "spot buy Dr 1300 = 100" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='DIRECT_PURCHASE' AND je.\"sourceId\"='$DP2' AND a.code='1300'" 100
expect_num "spot buy Cr 1000 cash = 118" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='DIRECT_PURCHASE' AND je.\"sourceId\"='$DP2' AND a.code='1000'" 118
expect_num "spot buy touches NO AP" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='DIRECT_PURCHASE' AND je.\"sourceId\"='$DP2' AND a.code='2000'" 0
r=$(req PATCH "direct-purchases/$DP2" '{"action":"cancel"}')
echo "$r" | grep -q '"ok":true\|CANCELLED' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  spot cancel → ${r:0:90}"
expect_num "spot cancel net cash = 0" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceId\"='$DP2' AND a.code='1000' AND je.status='POSTED'" 0

echo "════════════════════════════════════════"
echo "direct-purchase chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
