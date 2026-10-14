#!/usr/bin/env bash
# Supplier-return → GL chain verification — the accounting invariant under
# a price-basis divergence:
#   create+auto-submit → gate pass auto-created → approve → complete:
#     stock −qty at MAC (movement ledger is the physical truth)
#     Dr AP              qty × PO price × (1+GST)  — supplier owes what was billed
#     Cr Inventory(1300) qty × MAC                  — what actually left the books
#     Cr Input GST       qty × PO price × GST       — ITC reversal on billed amount
#     PPV(5100) plug     qty × (MAC − PO price)     — basis difference, visible
#   guards: return > available refused; entry balanced; balanceOwed reduced.
#
# Uses a deliberately diverged price (PO 110 vs MAC ~102.83) to prove the
# PPV leg — under moving-average accounting the two must not silently drift.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-supplier-return-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                       # SRG REALCON
LOC="cmv0q8a4h006avlt72rifonze"                     # Central Store - Agra
MAT="cmv0qadjq006qvlt7o4zo7eae"                     # WIRE-BIND
SUP="cmv0q7nh2005uvlt7kolwshxz"                     # Shree Cement Suppliers

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

Q0=$(P "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
MAC=$(P "SELECT \"movingAvgCost\" FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'")
GST=$(P "SELECT \"gstRate\" FROM \"Material\" WHERE id='$MAT'")
BAL0=$(P "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'")
PO_PRICE=110
echo "  baseline: qty=$Q0 mac=$MAC gst=$GST supplierOwed=$BAL0  (returning at PO price $PO_PRICE)"
INV_VAL=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(10*$MAC::numeric,2)")
SUB=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(10*$PO_PRICE::numeric,2)")
GSTV=$(psql -h localhost -d nirman_inventory -tAc "SELECT round(10*$PO_PRICE*${GST:-0}/100,2)")
APV=$(psql -h localhost -d nirman_inventory -tAc "SELECT round($SUB::numeric + ${GSTV:-0}::numeric,2)")
PPV=$(psql -h localhost -d nirman_inventory -tAc "SELECT round($INV_VAL::numeric - $SUB::numeric,2)")

echo "════════ 1. create + auto-submit + gate pass ════════"
r=$(req POST "supplier-returns" "{\"supplierId\":\"$SUP\",\"locationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":10,\"unitCost\":$PO_PRICE,\"reason\":\"verifier basis drift\"}]}")
RT=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$RT" ] && { PASS=$((PASS+1)); echo "  return created $RT"; } || { FAIL=$((FAIL+1)); echo "  FAIL create: ${r:0:140}"; }
expect_cnt "status SUBMITTED" "SELECT CASE WHEN status='SUBMITTED' THEN 1 ELSE 0 END FROM \"SupplierReturn\" WHERE id='$RT'" 1
GP=$(P "SELECT id FROM \"GatePass\" WHERE \"linkedEntityType\"='SUPPLIER_RETURN' AND \"linkedEntityId\"='$RT' LIMIT 1" 2>/dev/null)
[ -z "$GP" ] && GP=$(P "SELECT id FROM \"GatePass\" WHERE notes LIKE '%$RT%' OR \"refId\"='$RT' LIMIT 1" 2>/dev/null)
[ -z "$GP" ] && GP=$(psql -h localhost -d nirman_inventory -tAc "SELECT id FROM \"GatePass\" WHERE \"createdAt\" > now() - interval '2 minutes' ORDER BY \"createdAt\" DESC LIMIT 1" | tr -d ' ')
[ -n "$GP" ] && { PASS=$((PASS+1)); echo "  gate pass auto-created $GP"; } || { FAIL=$((FAIL+1)); echo "  FAIL no gate pass found"; }

echo "════════ 2. complete blocked before gate approval ════════"
r=$(req PATCH "supplier-returns/$RT" '{"action":"complete"}')
expect_refused "complete before gate-pass approval" "$r"
[ -n "$GP" ] && req PATCH "gate-passes/$GP" '{"action":"approve"}' >/dev/null
expect_cnt "gate pass approved" "SELECT CASE WHEN status IN ('APPROVED','EXITED') THEN 1 ELSE 0 END FROM \"GatePass\" WHERE id='$GP'" 1

echo "════════ 3. complete → movement + GL at correct bases ════════"
r=$(req PATCH "supplier-returns/$RT" '{"action":"complete"}')
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  complete → ${r:0:110}"
expect_num "stock −10" "SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$MAT'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $Q0::numeric - 10")"
expect_cnt "RETURN movement" "SELECT count(*) FROM \"StockMovement\" WHERE \"movementType\"='RETURN' AND \"refType\"='SUPPLIER_RETURN' AND \"refId\"='$RT'" 1
expect_num "Dr AP = billed total" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_RETURN' AND je.\"sourceId\"='$RT' AND a.code='2000'" "$APV"
expect_num "Cr 1300 at MAC not PO price" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_RETURN' AND je.\"sourceId\"='$RT' AND a.code='1300'" "$INV_VAL"
expect_num "Cr ITC on billed" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_RETURN' AND je.\"sourceId\"='$RT' AND a.code='1400'" "$GSTV"
if psql -h localhost -d nirman_inventory -tAc "SELECT $PPV::numeric > 0" | grep -q t; then
  expect_num "PPV Dr = MAC−PO difference" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_RETURN' AND je.\"sourceId\"='$RT' AND a.code='5100'" "$PPV"
else
  expect_num "PPV Cr = MAC−PO difference" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_RETURN' AND je.\"sourceId\"='$RT' AND a.code='5100'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT abs($PPV::numeric)")"
fi
expect_num "entry balanced" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceType\"='SUPPLIER_RETURN' AND je.\"sourceId\"='$RT'" 0
expect_num "supplier balanceOwed −total" "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $BAL0::numeric - $APV::numeric")"

echo "════════ 4. guards ════════"
r=$(req POST "supplier-returns" "{\"supplierId\":\"$SUP\",\"locationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$MAT\",\"qty\":99999999,\"unitCost\":$PO_PRICE}]}")
RT2=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$RT2" ]; then
  GP2=$(psql -h localhost -d nirman_inventory -tAc "SELECT id FROM \"GatePass\" WHERE \"createdAt\" > now() - interval '1 minute' ORDER BY \"createdAt\" DESC LIMIT 1" | tr -d ' ')
  [ -n "$GP2" ] && req PATCH "gate-passes/$GP2" '{"action":"approve"}' >/dev/null
  r=$(req PATCH "supplier-returns/$RT2" '{"action":"complete"}')
  expect_refused "complete with qty > stock" "$r"
else
  PASS=$((PASS+1)); echo "  PASS oversize return refused at create"
fi
expect_cnt "status COMPLETED" "SELECT CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END FROM \"SupplierReturn\" WHERE id='$RT'" 1

echo "════════════════════════════════════════"
echo "supplier-return chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
