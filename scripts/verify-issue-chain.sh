#!/usr/bin/env bash
# Material-issue → GL/WIP chain verification — exercises the REAL postings
# end-to-end at movement + journal + unit-cost level:
#   direct project issue → stock −qty at MAC, Dr WIP(1500)/Cr Inventory(1300)
#   → project material cost + unit productionCost reallocation
#   → department issue → Dr OPEX(6000) not WIP
#   → requisition gating (SUBMITTED refused, APPROVED allowed, wrong project refused)
#   → ON_HOLD project refused, builtUnit from another project refused,
#     oversize issue refused.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-issue-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                       # SRG REALCON
PROJ="cmtwhwzer000pvlt3cth8e8qo"                    # apex center
# Resolve a live CREATED sellable unit — the ΣproductionCost reallocation check
# needs one; provision a fixture unit if the project has none.
UNIT=$(P "SELECT id FROM \"BuiltUnit\" WHERE \"projectId\"='$PROJ' AND \"originType\"='CREATED' AND status IN ('AVAILABLE','HOLD','UNDER_CONSTRUCTION','RESERVED') AND \"deletedAt\" IS NULL LIMIT 1")
[ -z "$UNIT" ] && { UNIT="vfyu$(date +%s)"; P "INSERT INTO \"BuiltUnit\" (id,\"projectId\",\"unitNumber\",\"unitType\",area,status,\"originType\",\"updatedAt\",\"createdAt\") VALUES ('$UNIT','$PROJ','VFY-1','BHK_2',1200,'AVAILABLE','CREATED',now(),now())"; }
# The SOLD-unit guard check needs a unit whose cost basis is frozen.
SOLDUNIT=$(P "SELECT id FROM \"BuiltUnit\" WHERE \"projectId\"='$PROJ' AND status='SOLD' AND \"deletedAt\" IS NULL LIMIT 1")
[ -z "$SOLDUNIT" ] && { SOLDUNIT="vfysu$(date +%s)"; P "INSERT INTO \"BuiltUnit\" (id,\"projectId\",\"unitNumber\",\"unitType\",area,status,\"originType\",\"updatedAt\",\"createdAt\") VALUES ('$SOLDUNIT','$PROJ','VFY-S1','BHK_2',1200,'SOLD','CREATED',now(),now())"; }
LOC="cmv0q8a4h006avlt72rifonze"                     # Central Store - Agra
MAT="cmv0qadjq006qvlt7o4zo7eae"                     # WIRE-BIND 5mm
DEPT="isd$(date +%s)"
OHPROJ="isoh$(date +%s)"                            # synthetic ON_HOLD project
REQ_SUB="isrs$(date +%s)"
REQ_APP="isra$(date +%s)"

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { # label sql want [tol] — numeric compare within ₹0.03 (or $4)
  got=$(P "$2")
  local TOL=${4:-0.03}
  ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < $TOL")
  [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { # label response — expect non-ok error
  case "$2" in
    *'"ok":true'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:120}";;
    *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:80})";;
  esac
}
glbal() { P "SELECT COALESCE(SUM(jl.debit)-SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE a.code='$1' AND a.\"companyId\"='$C' AND je.status='POSTED'"; }
qty_at() { P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$1' AND \"materialId\"='$2'"; }

echo "════════ setup: department + ON_HOLD project + requisitions ════════"
P "INSERT INTO \"Department\" (id,\"companyId\",code,name,\"updatedAt\") VALUES ('$DEPT','$C','D$DEPT','is-dept-office',now())"
P "INSERT INTO \"Project\" (id,name,\"companyId\",status,\"updatedAt\") VALUES ('$OHPROJ','is-onhold','$C','ON_HOLD',now())"
P "INSERT INTO \"MaterialRequisition\" (id,\"reqNumber\",\"projectId\",status,\"updatedAt\",\"createdAt\") VALUES ('$REQ_SUB','ISR-S-$REQ_SUB','$PROJ','SUBMITTED',now(),now())"
P "INSERT INTO \"MaterialRequisition\" (id,\"reqNumber\",\"projectId\",status,\"updatedAt\",\"createdAt\") VALUES ('$REQ_APP','ISR-A-$REQ_APP','$PROJ','APPROVED',now(),now())"
# The line authorizes issue qty — an approved requisition caps cumulative
# issue at qtyRequested per material.
P "INSERT INTO \"MaterialRequisitionLine\" (id,\"requisitionId\",\"materialId\",\"qtyRequested\") VALUES ('line-$REQ_APP','$REQ_APP','$MAT',10)"

Q0=$(qty_at "$LOC" "$MAT"); MAC0=$(P "SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
WIP0=$(glbal 1500); INV0=$(glbal 1300); OPEX0=$(glbal 6000)
PC0=$(P "SELECT COALESCE(SUM(\"productionCost\"),0) FROM \"BuiltUnit\" WHERE \"projectId\"='$PROJ'")
echo "  baseline: qty=$Q0 mac=$MAC0 WIP=$WIP0 INV=$INV0 OPEX=$OPEX0 ΣprodCost=$PC0"
ISSUE_COST=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(5*$MAC0::numeric,2)")

echo "════════ 1. direct project issue ════════"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":5}]}")
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  issue → ${r:0:140}"
ISS=$(P "SELECT id FROM \"MaterialIssue\" WHERE \"projectId\"='$PROJ' AND \"fromLocationId\"='$LOC' ORDER BY \"issueDate\" DESC LIMIT 1")
expect_num "source stock −5" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(( $(echo "$Q0" | cut -d. -f1) - 5 ))"
expect_cnt "ISSUE_TO_PROJECT movement" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='ISSUE_TO_PROJECT' AND \"refType\"='MATERIAL_ISSUE' AND \"refId\"='$ISS'" 1
expect_num "journal Dr WIP = 5×MAC" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_ISSUE' AND je.\"sourceId\"='$ISS' AND a.code='1500'" "$ISSUE_COST"
expect_num "journal Cr 1300 = 5×MAC" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_ISSUE' AND je.\"sourceId\"='$ISS' AND a.code='1300'" "$ISSUE_COST"
# reallocateProjectCosts redistributes via costPerSqft×area — paise-level
# rounding shifts between the units on every rerun, so allow ₹0.25 here.
expect_num "ΣproductionCost +lineCost" "SELECT COALESCE(SUM(\"productionCost\"),0) FROM \"BuiltUnit\" WHERE \"projectId\"='$PROJ'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT round($PC0::numeric + 5*$MAC0::numeric,2)")" 0.25

echo "════════ 2. unit-tagged issue ════════"
# SOLD unit: cost basis frozen — the issue must be refused (was silently
# accepted and stranded in WIP before the guard).
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"builtUnitId\":\"$SOLDUNIT\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":2}]}")
expect_refused "issue to SOLD unit" "$r"
# PLANNED unit: allowed — the direct cost waits in WIP until the unit joins
# the allocatable set, then lands on it. Prove the deferred write by
# flipping the unit to UNDER_CONSTRUCTION and triggering a reallocation.
PU="isu$(date +%s)"
P "INSERT INTO \"BuiltUnit\" (id,\"projectId\",\"unitType\",\"unitNumber\",area,status,\"originType\",\"updatedAt\") VALUES ('$PU','$PROJ','BHK_2','IS-PLANNED-$PU',1200,'PLANNED','CREATED',now())"
UC0=$(P "SELECT \"productionCost\" FROM \"BuiltUnit\" WHERE id='$PU'")
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"builtUnitId\":\"$PU\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":2}]}")
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  unit issue → ${r:0:120}"
expect_num "PLANNED unit cost deferred (still 0)" "SELECT \"productionCost\" FROM \"BuiltUnit\" WHERE id='$PU'" 0
# flip sellable + one more pool issue to trigger reallocation
P "UPDATE \"BuiltUnit\" SET status='UNDER_CONSTRUCTION' WHERE id='$PU'"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  realloc trigger issue → ${r:0:80}"
# PU now gets its 2×MAC direct cost PLUS its area share of the pool — assert ≥ direct cost
ok=$(P "SELECT \"productionCost\" >= 2*$MAC0::numeric - 0.02 FROM \"BuiltUnit\" WHERE id='$PU'")
[ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS deferred unit cost landed ($(P "SELECT \"productionCost\" FROM \"BuiltUnit\" WHERE id='$PU'"))"; } || { FAIL=$((FAIL+1)); echo "  FAIL deferred unit cost: got $(P "SELECT \"productionCost\" FROM \"BuiltUnit\" WHERE id='$PU'")"; }

echo "════════ 3. department issue → OPEX, never WIP ════════"
DEPT_COST=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(3*(SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT')::numeric,2)")
r=$(req POST "issue-materials" "{\"departmentId\":\"$DEPT\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":3}]}")
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  dept issue → ${r:0:120}"
DISS=$(P "SELECT id FROM \"MaterialIssue\" WHERE \"departmentId\"='$DEPT' ORDER BY \"issueDate\" DESC LIMIT 1")
expect_num "dept journal Dr 6000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_ISSUE_DEPARTMENT' AND je.\"sourceId\"='$DISS' AND a.code='6000'" "$DEPT_COST"
expect_cnt "dept issue created NO WIP leg" "SELECT count(*) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_ISSUE_DEPARTMENT' AND je.\"sourceId\"='$DISS' AND a.code='1500'" 0
expect_cnt "dept issue NOT in project material costs" "SELECT count(*) FROM \"MaterialIssueLine\" mil JOIN \"MaterialIssue\" mi ON mi.id=mil.\"materialIssueId\" WHERE mi.id='$DISS' AND mil.\"unitCost\" > 0 AND mi.\"projectId\" IS NOT NULL" 0

echo "════════ 4. requisition gating ════════"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"requisitionId\":\"$REQ_SUB\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
expect_refused "issue against SUBMITTED requisition" "$r"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"requisitionId\":\"$REQ_APP\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  issue vs APPROVED req → ${r:0:100}"
r=$(req POST "issue-materials" "{\"projectId\":\"$OHPROJ\",\"fromLocationId\":\"$LOC\",\"requisitionId\":\"$REQ_APP\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
expect_refused "req.projectId mismatch refused" "$r"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"requisitionId\":\"$REQ_APP\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":11}]}")
expect_refused "issue above approved qty refused" "$r"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"requisitionId\":\"$REQ_APP\",\"lines\":[{\"materialId\":\"mat-noauth-$RANDOM\",\"qty\":1}]}")
expect_refused "material not on requisition refused" "$r"

echo "════════ 5. negative guards ════════"
r=$(req POST "issue-materials" "{\"projectId\":\"$OHPROJ\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
expect_refused "issue to ON_HOLD project" "$r"
r=$(req POST "issue-materials" "{\"projectId\":\"$OHPROJ\",\"builtUnitId\":\"$UNIT\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":1}]}")
expect_refused "builtUnit from another project" "$r"
r=$(req POST "issue-materials" "{\"projectId\":\"$PROJ\",\"fromLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":99999999}]}")
expect_refused "issue more than stock" "$r"
# stock untouched by all the refused calls — issued: 5 direct + 2 planned-unit
# + 1 realloc-trigger + 3 dept + 1 approved-req = 12
expect_num "net stock = Q0 −12" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric - 12")"

echo "════════════════════════════════════════"
echo "issue chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
