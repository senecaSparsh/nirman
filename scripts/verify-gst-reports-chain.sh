#!/usr/bin/env bash
# GST report (GSTR-1 / GSTR-3B) arithmetic verification:
#   mixed sale (regular + scrap lines on ONE invoice) → GSTR-1 taxable
#     value must equal ALL revenue credits on the JE (4000 + 4100), not
#     just the last leg — and derived rate must come out to the real 18%.
#   GSTR-3B outward taxable = Σ revenue credits; ITC = Σ 1400 debits.
#   Credit-note reversals (2100 debits) must not appear as outward supply.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-gst-reports-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
LOC="cmv0q8a4h006avlt72rifonze"                      # Central Store - Agra
MAT="cmv0qadjq006qvlt7o4zo7eae"                      # WIRE-BIND
SCRAP="cmv16vzrw00fdvle2ps9gnxdy"                    # SCRAP-STEEL
CUST="cmtwi53250001vljm6ru892z6"                     # Sparsh
TODAY=$(date +%F)

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
get() { curl -s -b "$JAR" --max-time 60 "$BASE/api/$1"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_json() { # label jsonpath want — numeric compare via python
  got=$(echo "$3" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d$4)" 2>/dev/null)
  ok=$(python3 -c "print(abs(float('${got:-nan}') - float('$5')) < 0.03 if '${got:-nan}' not in ('nan','') else False)")
  [ "$ok" = "True" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $5 got ${got:-<none>}"; }
}

echo "════════ 1. mixed sale: 2 WIRE @150 + 1 SCRAP @40, 18% GST ════════"
# subtotal = 300 + 40 = 340, gst = 61.20, total 401.20
SQ=$(P "SELECT COALESCE((SELECT qty FROM \"StockLocationItem\" WHERE \"locationId\"='$LOC' AND \"materialId\"='$SCRAP'),0)")
[ "${SQ%%.*}" -lt 1 ] && req POST "scrap-generations" "{\"toLocationId\":\"$LOC\",\"lines\":[{\"materialId\":\"$SCRAP\",\"qty\":3,\"unitCost\":25}]}" >/dev/null
r=$(req POST "material-sales" "{\"customerId\":\"$CUST\",\"lines\":[{\"materialId\":\"$MAT\",\"locationId\":\"$LOC\",\"qty\":2,\"unitPrice\":150,\"gstRate\":18},{\"materialId\":\"$SCRAP\",\"locationId\":\"$LOC\",\"qty\":1,\"unitPrice\":40,\"gstRate\":18}]}")
SALE=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$SALE" ] && { PASS=$((PASS+1)); echo "  sale $SALE"; } || { FAIL=$((FAIL+1)); echo "  FAIL sale: ${r:0:150}"; exit 1; }
expect_num "Cr revenue legs total 340" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code IN ('4000','4100','4200')" 340
expect_num "Cr output GST 61.20" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code='2100'" 61.20
expect_cnt "two revenue legs on one JE" "SELECT count(*) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='MATERIAL_SALE' AND je.\"sourceId\"='$SALE' AND a.code IN ('4000','4100') AND jl.credit > 0" 2

echo "════════ 2. GSTR-1: taxable = BOTH revenue legs ════════"
G1=$(get "gst-reports?type=gstr1&from=$TODAY&to=$TODAY")
# find the entry whose JE belongs to our sale
JID=$(P "SELECT id FROM \"JournalEntry\" WHERE \"sourceType\"='MATERIAL_SALE' AND \"sourceId\"='$SALE' AND status='POSTED' ORDER BY \"entryDate\" DESC LIMIT 1")
E=$(echo "$G1" | python3 -c "import json,sys; d=json.load(sys.stdin); es=[e for e in d.get('entries',[]) if e['journalEntryId']=='$JID']; print(json.dumps(es[0]) if es else '{}')")
[ "$E" != "{}" ] && { PASS=$((PASS+1)); echo "  entry found for sale JE"; } || { FAIL=$((FAIL+1)); echo "  FAIL entry missing"; }
TV=$(echo "$E" | python3 -c "import json,sys; print(json.load(sys.stdin).get('taxableValue',-1))")
ok=$(python3 -c "print(abs(float('$TV')-340) < 0.03)")
[ "$ok" = "True" ] && { PASS=$((PASS+1)); echo "  PASS taxable = 340 (both legs) → $TV"; } || { FAIL=$((FAIL+1)); echo "  FAIL taxable: want 340 got $TV (single-leg bug)"; }
RT=$(echo "$E" | python3 -c "import json,sys; print(json.load(sys.stdin).get('gstRate',-1))")
ok=$(python3 -c "print(abs(float('$RT')-18) < 0.05)")
[ "$ok" = "True" ] && { PASS=$((PASS+1)); echo "  PASS derived rate = 18% → $RT"; } || { FAIL=$((FAIL+1)); echo "  FAIL rate: want 18 got $RT"; }
# No company/customer GSTIN → nothing is intra-state → ALL output GST is IGST
TT=$(echo "$G1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['totalIgst'],d['totalOutputGst'],d['totalCgst'],d['totalSgst'])")
ok=$(python3 -c "t,og,c,s='$TT'.split(); print(abs(float(t)-float(og))<0.01 and abs(float(c))<0.01 and abs(float(s))<0.01)")
[ "$ok" = "True" ] && { PASS=$((PASS+1)); echo "  PASS all output GST → IGST ($TT)"; } || { FAIL=$((FAIL+1)); echo "  FAIL split: igst/cgst/sgst/out = $TT"; }

echo "════════ 3. return's credit-note reversal NOT in outward supply ════════"
SL=$(P "SELECT id FROM \"MaterialSaleLine\" WHERE \"materialSaleId\"='$SALE' AND \"materialId\"='$MAT'")
r=$(req POST "material-sales/$SALE/returns" "{\"lines\":[{\"materialSaleLineId\":\"$SL\",\"qty\":1,\"reason\":\"verifier\"}]}")
echo "$r" | grep -q '"id"' && { PASS=$((PASS+1)); echo "  return posted"; } || { FAIL=$((FAIL+1)); echo "  FAIL return: ${r:0:120}"; }
G1B=$(get "gst-reports?type=gstr1&from=$TODAY&to=$TODAY")
# the return's reversal JE carries a 2100 DEBIT — it must not create an entry
RJID=$(P "SELECT je.id FROM \"JournalEntry\" je WHERE je.\"sourceId\" IN (SELECT id FROM \"MaterialSaleReturn\" WHERE \"materialSaleId\"='$SALE') AND je.\"sourceType\" LIKE '%REVERSAL%'")
CNT=$(echo "$G1B" | python3 -c "import json,sys; d=json.load(sys.stdin); ids={'$RJID'}; print(sum(1 for e in d.get('entries',[]) if e['journalEntryId'] in ids))")
[ "$CNT" = "0" ] && { PASS=$((PASS+1)); echo "  PASS reversal not an outward entry"; } || { FAIL=$((FAIL+1)); echo "  FAIL reversal appeared as outward ($CNT)"; }

echo "════════ 4. GSTR-3B ties to GL ════════"
G3=$(get "gst-reports?type=gstr3b&from=$TODAY&to=$TODAY")
# outward taxable = Σ all revenue-account credits today
SQL_TAX=$(P "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"companyId\"='$C' AND je.\"entryDate\" BETWEEN '$TODAY 18:30:00'::timestamp - interval '1 day' AND '$TODAY 18:29:59'::timestamp AND a.code IN ('4000','4100','4200')")
expect_json "3b outward taxable = Σ revenue credits" "" "$G3" "['outwardTaxableValue']" "$SQL_TAX"
SQL_OUT=$(P "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"companyId\"='$C' AND je.\"entryDate\" BETWEEN '$TODAY 18:30:00'::timestamp - interval '1 day' AND '$TODAY 18:29:59'::timestamp AND a.code='2100'")
expect_json "3b output GST = Σ 2100 credits" "" "$G3" "['outwardOutputGst']" "$SQL_OUT"
SQL_IN=$(P "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"companyId\"='$C' AND je.\"entryDate\" BETWEEN '$TODAY 18:30:00'::timestamp - interval '1 day' AND '$TODAY 18:29:59'::timestamp AND a.code='1400'")
expect_json "3b inward GST = Σ 1400 debits" "" "$G3" "['inwardInputGst']" "$SQL_IN"
SQL_REV=$(P "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"companyId\"='$C' AND je.\"entryDate\" BETWEEN '$TODAY 18:30:00'::timestamp - interval '1 day' AND '$TODAY 18:29:59'::timestamp AND a.code='1400'")
expect_json "3b itcReversed = Σ 1400 credits" "" "$G3" "['itcReversed']" "$SQL_REV"
NET_ITC=$(psql -h localhost -d nirman_inventory -tAc "SELECT $SQL_IN::numeric - $SQL_REV::numeric")
expect_json "3b itcAvailable = debits − credits" "" "$G3" "['itcAvailable']" "$NET_ITC"
NET_PAY=$(psql -h localhost -d nirman_inventory -tAc "SELECT $SQL_OUT::numeric - ($SQL_IN::numeric - $SQL_REV::numeric)")
expect_json "3b netGstPayable = output − itcAvailable" "" "$G3" "['netGstPayable']" "$NET_PAY"

echo "════════════════════════════════════════"
echo "gst-reports chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
