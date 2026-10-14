#!/usr/bin/env bash
# WIP → unit-asset capitalization verification — when a CREATED unit
# becomes AVAILABLE, its accumulated production cost moves from WIP(1500)
# to Unsold Assets(1800), delta-idempotent via capitalizedAmount.
#
#   issue materials to a PLANNED unit → cost waits in WIP
#   PLANNED→UNDER_CONSTRUCTION → reallocation lands it on the unit
#   UNDER_CONSTRUCTION→AVAILABLE → Dr 1800 / Cr 1500 = productionCost
#   AVAILABLE→HOLD→AVAILABLE again → delta=0 → no second JE
#   guards: PLANNED→AVAILABLE refused; PURCHASED unit gets no JE.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-wip-capitalization.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
LOC="cmv0q8a4h006avlt72rifonze"                      # Central Store - Agra
MAT="cmv0qadjq006qvlt7o4zo7eae"                      # WIRE-BIND
PROJ="cmtwhwzer000pvlt3cth8e8qo"                     # apex center
U="wcu$(date +%s)"
UP="wcp$(date +%s)"

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

echo "════════ setup: PLANNED unit + PURCHASED unit ════════"
P "INSERT INTO \"BuiltUnit\" (id,\"projectId\",\"unitType\",\"unitNumber\",area,status,\"originType\",\"updatedAt\") VALUES ('$U','$PROJ','BHK_2','WC-CREATED-$U',1200,'PLANNED','CREATED',now())"
P "INSERT INTO \"BuiltUnit\" (id,\"projectId\",\"unitType\",\"unitNumber\",area,status,\"originType\",\"acquisitionCost\",\"updatedAt\") VALUES ('$UP','$PROJ','BHK_2','WC-PURCH-$UP',1200,'UNDER_CONSTRUCTION','PURCHASED',500000,now())"

echo "════════ 1. issue 4 units to the PLANNED unit — cost waits in WIP ════════"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"builtUnitId\":\"$U\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":4}]}")
echo "$r" | grep -q '"ok":true' && { PASS=$((PASS+1)); echo "  issue ok"; } || { FAIL=$((FAIL+1)); echo "  FAIL issue: ${r:0:120}"; }
expect_num "PLANNED unit cost still 0 (deferred)" "SELECT \"productionCost\" FROM \"BuiltUnit\" WHERE id='$U'" 0

echo "════════ 2. transition guards ════════"
r=$(req PATCH "built-units/$U" '{"action":"status","status":"AVAILABLE"}')
expect_refused "PLANNED→AVAILABLE" "$r"

echo "════════ 3. UNDER_CONSTRUCTION → AVAILABLE → capitalization ════════"
r=$(req PATCH "built-units/$U" '{"action":"status","status":"UNDER_CONSTRUCTION"}')
echo "$r" | grep -q '"ok":true\|status' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  → UC: ${r:0:80}"
# The AVAILABLE transition re-runs reallocation first, so productionCost
# only lands at this step — read it after AVAIL, not after UC.
r=$(req PATCH "built-units/$U" '{"action":"status","status":"AVAILABLE"}')
echo "$r" | grep -q '"ok":true\|status' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  → AVAIL: ${r:0:80}"
PDC=$(P "SELECT \"productionCost\" FROM \"BuiltUnit\" WHERE id='$U'")
ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT $PDC::numeric > 0")
[ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS productionCost landed → $PDC"; } || { FAIL=$((FAIL+1)); echo "  FAIL productionCost 0"; }
expect_num "JE Dr 1800 = productionCost" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='WIP_CAPITALIZATION' AND je.\"sourceId\"='$U' AND a.code='1800'" "$PDC"
expect_num "JE Cr 1500 = productionCost" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='WIP_CAPITALIZATION' AND je.\"sourceId\"='$U' AND a.code='1500'" "$PDC"
expect_num "capitalizedAmount = productionCost" "SELECT \"capitalizedAmount\" FROM \"BuiltUnit\" WHERE id='$U'" "$PDC"

echo "════════ 5. delta-idempotent — no double capitalization ════════"
req PATCH "built-units/$U" '{"action":"status","status":"HOLD"}' >/dev/null
r=$(req PATCH "built-units/$U" '{"action":"status","status":"AVAILABLE"}')
echo "$r" | grep -q '"ok":true\|status' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  → AVAIL again: ${r:0:80}"
expect_cnt "exactly ONE cap JE" "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='WIP_CAPITALIZATION' AND \"sourceId\"='$U' AND status='POSTED'" 1

echo "════════ 6. PURCHASED unit — no WIP to capitalize ════════"
P "UPDATE \"BuiltUnit\" SET \"capitalizedAmount\"=\"acquisitionCost\" WHERE id='$UP'"
r=$(req PATCH "built-units/$UP" '{"action":"status","status":"AVAILABLE"}')
echo "$r" | grep -q '"ok":true\|status' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  purchased → AVAIL: ${r:0:80}"
expect_cnt "no cap JE for purchased unit" "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='WIP_CAPITALIZATION' AND \"sourceId\"='$UP'" 0

echo "════════════════════════════════════════"
echo "wip-capitalization chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
