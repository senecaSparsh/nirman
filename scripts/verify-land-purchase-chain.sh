#!/usr/bin/env bash
# Land purchase chain verification:
#   BOOKED purchase ₹1L with ₹10k token (UPI) → parcel created,
#     Dr 1700 = 100000 / Cr 1000 = 10000 / Cr 2000 = 90000
#   CHEQUE payment posts NO GL until cleared (deferred posting)
#   bounced cheque → still no GL, excluded from paid totals
#   UPI payment → Dr 2000 / Cr 1000 immediately
#   guards: overpay refused, duplicate UTR refused, BOOKED can't complete
#   REGISTERED + registry doc + partialRegistry → COMPLETED
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-land-purchase-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
REF="UTR-$(date +%s)"

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*|*'"id"'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

echo "════════ 1. BOOKED purchase ₹100k, token ₹10k UPI ════════"
r=$(req POST "land-purchases" "{\"mode\":\"BOOKED\",\"sellerName\":\"Verifier Seller\",\"totalArea\":2000,\"areaUnit\":\"SQFT\",\"totalCost\":100000,\"tokenAmount\":10000,\"tokenPaymentMode\":\"UPI\",\"location\":\"Verifier Site\"}")
LP=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$LP" ] && { PASS=$((PASS+1)); echo "  purchase $LP"; } || { FAIL=$((FAIL+1)); echo "  FAIL create: ${r:0:150}"; exit 1; }
expect_num "Dr LAND 100000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE' AND je.\"sourceId\"='$LP' AND a.code='1700'" 100000
expect_num "Cr CASH 10000 (token)" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE' AND je.\"sourceId\"='$LP' AND a.code='1000'" 10000
expect_num "Cr AP 90000 (balance)" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE' AND je.\"sourceId\"='$LP' AND a.code='2000'" 90000
expect_cnt "parcel HOLD while booked" "SELECT count(*) FROM \"LandParcel\" WHERE \"landPurchaseId\"='$LP' AND status='HOLD'" 1
expect_cnt "stage BOOKED" "SELECT CASE WHEN \"purchaseStage\"='BOOKED' THEN 1 ELSE 0 END FROM \"LandPurchase\" WHERE id='$LP'" 1

echo "════════ 2. cheque payment — GL deferred until cleared ════════"
r=$(req POST "land-purchases/$LP/payment" "{\"amount\":20000,\"paymentMode\":\"CHEQUE\",\"chequeNo\":\"CHQ$REF\",\"chequeDate\":\"$(date +%F)\"}")
PAY=$(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('payment',{}).get('id') or d.get('paymentId') or d.get('id',''))" 2>/dev/null)
[ -n "$PAY" ] && { PASS=$((PASS+1)); echo "  cheque payment $PAY"; } || { FAIL=$((FAIL+1)); echo "  FAIL pay: ${r:0:130}"; }
expect_cnt "no GL for pending cheque" "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='LAND_PURCHASE_PAYMENT' AND \"sourceId\"='$PAY' AND status='POSTED'" 0

echo "════════ 3. bounce — still no GL, excluded from paid ════════"
r=$(req POST "land-purchases/payments/$PAY/cheque" '{"action":"bounce","bounceReason":"insufficient funds"}')
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  bounce → ${r:0:80}"
expect_cnt "no GL after bounce" "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='LAND_PURCHASE_PAYMENT' AND \"sourceId\"='$PAY' AND status='POSTED'" 0
expect_cnt "cheque BOUNCED" "SELECT CASE WHEN \"chequeStatus\"='BOUNCED' THEN 1 ELSE 0 END FROM \"LandPurchasePayment\" WHERE id='$PAY'" 1

echo "════════ 4. guards ════════"
r=$(req POST "land-purchases/$LP/payment" "{\"amount\":91000,\"paymentMode\":\"UPI\",\"referenceNo\":\"$REF\"}")
expect_refused "overpay (> total − paid)" "$r"
r=$(req POST "land-purchases/$LP/payment" "{\"amount\":20000,\"paymentMode\":\"UPI\",\"referenceNo\":\"$REF\"}")
PAY2=$(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('payment',{}).get('id') or d.get('paymentId') or d.get('id',''))" 2>/dev/null)
[ -n "$PAY2" ] && { PASS=$((PASS+1)); echo "  UPI payment $PAY2"; } || { FAIL=$((FAIL+1)); echo "  FAIL UPI pay: ${r:0:120}"; }
expect_num "Dr AP 20000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE_PAYMENT' AND je.\"sourceId\"='$PAY2' AND a.code='2000'" 20000
r=$(req POST "land-purchases/$LP/payment" "{\"amount\":5000,\"paymentMode\":\"UPI\",\"referenceNo\":\"$REF\"}")
expect_refused "duplicate UTR" "$r"

echo "════════ 5. completion gates ════════"
r=$(req POST "land-purchases/$LP/complete" '{"registryDocumentUrl":"/files/reg.pdf","partialRegistryAllowed":true}')
expect_refused "BOOKED can't complete (BBA/ATS first)" "$r"
# advance to REGISTERED (the document-upload stage transitions are file-upload
# routes — set the stage directly to exercise the completion invariant)
P "UPDATE \"LandPurchase\" SET \"purchaseStage\"='REGISTERED' WHERE id='$LP'"
r=$(req POST "land-purchases/$LP/complete" '{"partialRegistryAllowed":true}')
expect_refused "no registry doc → refused" "$r"
r=$(req POST "land-purchases/$LP/complete" "{\"registryDocumentUrl\":\"/files/reg-$REF.pdf\",\"partialRegistryAllowed\":true}")
echo "$r" | grep -q '"ok":true\|COMPLETED' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  complete → ${r:0:90}"
expect_cnt "stage COMPLETED" "SELECT CASE WHEN \"purchaseStage\"='COMPLETED' THEN 1 ELSE 0 END FROM \"LandPurchase\" WHERE id='$LP'" 1
expect_cnt "parcel flips AVAILABLE on completion" "SELECT count(*) FROM \"LandParcel\" WHERE \"landPurchaseId\"='$LP' AND status='AVAILABLE'" 1
r=$(req POST "land-purchases/$LP/payment" '{"amount":1000,"paymentMode":"UPI"}')
expect_refused "payment on completed purchase" "$r"

echo "════════════════════════════════════════"
echo "land-purchase chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
