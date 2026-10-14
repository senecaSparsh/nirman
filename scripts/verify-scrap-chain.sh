#!/usr/bin/env bash
# Scrap generation → sale → cancel chain verification:
#   generate scrap (project-tagged): SCRAP_GENERATED movement in at declared
#     cost, GL Dr 1300 / Cr WIP(1500) — the project gets its cost back
#   scrap sale: revenue leg credits COST_RECOVERY (4100), not SALES_REVENUE
#   cancel after sale: refused — the scrap units are gone, generation can't
#     be unwound (stock-level guard catches it)
#   clean cancel: ADJUSTMENT_OUT restores nothing (scrap was new stock —
#     removal returns it to zero), journal reversed, WIP restored.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-scrap-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
LOC="cmv0q8a4h006avlt72rifonze"                      # Central Store - Agra
MAT="cmv16vzrw00fdvle2ps9gnxdy"                      # SCRAP-STEEL
PROJ="cmtwhwzer000pvlt3cth8e8qo"                     # apex center
CUST="cmtwi53250001vljm6ru892z6"                     # Sparsh

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*|*'"id"'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

Q0=$(P "SELECT COALESCE((SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'),0)")
PC0=$(P "SELECT \"totalProjectCost\" FROM \"Project\" WHERE id='$PROJ'")
echo "  baseline: scrapQty=$Q0 projectCost=$PC0"

echo "════════ 1. generate 20 @ ₹25 project-tagged ════════"
r=$(req POST "scrap-generations" "{\"toLocationId\":\"$LOC\",\"projectId\":\"$PROJ\",\"sourceMaterialId\":\"$MAT\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":20,\"unitCost\":25}]}")
SG=$(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
[ -n "$SG" ] && { PASS=$((PASS+1)); echo "  generation $SG"; } || { FAIL=$((FAIL+1)); echo "  FAIL create: ${r:0:140}"; }
expect_num "stock +20" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric + 20")"
expect_cnt "SCRAP_GENERATED movement" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='SCRAP_GENERATED' AND \"refType\"='SCRAP_GENERATION' AND \"refId\"='$SG'" 1
expect_num "Dr 1300 = 500" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SCRAP_GENERATION' AND je.\"sourceId\"='$SG' AND a.code='1300'" 500
expect_num "Cr WIP = 500" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SCRAP_GENERATION' AND je.\"sourceId\"='$SG' AND a.code='1500'" 500
expect_num "project cost −500" "SELECT \"totalProjectCost\" FROM \"Project\" WHERE id='$PROJ'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $PC0::numeric - 500")"

echo "════════ 2. sell 5 @ ₹40 — cost recovery, not revenue ════════"
r=$(req POST "material-sales" "{\"customerId\":\"$CUST\",\"lines\":[{\"materialId\":\"$MAT\",\"locationId\":\"$LOC\",\"qty\":5,\"unitPrice\":40,\"gstRate\":18}]}")
SALE=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$SALE" ] && { PASS=$((PASS+1)); echo "  sale $SALE"; } || { FAIL=$((FAIL+1)); echo "  FAIL sale: ${r:0:130}"; }
expect_num "Cr CostRecovery 200" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code='4100'" 200
expect_cnt "NOT revenue 4000" "SELECT count(*) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code='4000' AND jl.credit > 0" 0
expect_num "Cr OutputGST 36" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code='2100'" 36
expect_num "stock now 15" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric + 15")"

echo "════════ 3. cancel refused only when the pool can't cover it ════════"
# Scrap is fungible — cancelling removes the generation's qty from the
# pool, regardless of which units sold. The guard only fires when the
# pool < generation qty. Drain enough to force it: pool is now 15.
r=$(req POST "material-sales" "{\"customerId\":\"$CUST\",\"lines\":[{\"materialId\":\"$MAT\",\"locationId\":\"$LOC\",\"qty\":15,\"unitPrice\":40,\"gstRate\":0}]}")
echo "$r" | grep -q '"id"' && { PASS=$((PASS+1)); echo "  drain sale ok"; } || { FAIL=$((FAIL+1)); echo "  FAIL drain: ${r:0:110}"; }
POOL=$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
[ "${POOL%%.*}" -lt 20 ] && { PASS=$((PASS+1)); echo "  pool $POOL < 20"; } || { FAIL=$((FAIL+1)); echo "  FAIL pool $POOL >= 20"; }
r=$(req PATCH "scrap-generations/$SG" '{"action":"cancel"}')
expect_refused "cancel when pool can't cover generation" "$r"
expect_cnt "still not cancelled" "SELECT CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END FROM \"ScrapGeneration\" WHERE id='$SG'" 0

echo "════════ 4. clean cancel restores WIP ════════"
r=$(req POST "scrap-generations" "{\"toLocationId\":\"$LOC\",\"projectId\":\"$PROJ\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":5,\"unitCost\":25}]}")
SG2=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$SG2" ] && { PASS=$((PASS+1)); echo "  gen2 $SG2"; } || { FAIL=$((FAIL+1)); echo "  FAIL gen2: ${r:0:120}"; }
POOL1=$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
PC1=$(P "SELECT \"totalProjectCost\" FROM \"Project\" WHERE id='$PROJ'")
r=$(req PATCH "scrap-generations/$SG2" '{"action":"cancel"}')
echo "$r" | grep -q '"ok":true\|CANCELLED' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  cancel → ${r:0:90}"
expect_num "scrap −5 back" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $POOL1::numeric - 5")"
expect_cnt "journal reversed" "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='SCRAP_GENERATION_REVERSAL' AND \"sourceId\"='$SG2' AND status='POSTED'" 1
expect_num "project cost restored" "SELECT \"totalProjectCost\" FROM \"Project\" WHERE id='$PROJ'" "$PC1"
r=$(req PATCH "scrap-generations/$SG2" '{"action":"cancel"}')
expect_refused "cancel again" "$r"

echo "════════════════════════════════════════"
echo "scrap chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
