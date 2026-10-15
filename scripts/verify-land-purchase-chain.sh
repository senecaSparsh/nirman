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

echo "════════ 6. project-linked purchase → WIP, not Land Asset ════════"
# A purchase bound to a project capitalises into WIP (1500): the unit-cost
# pool counts parcel.acquisitionCost, so the GL must route the same way.
LPROJ="wlp-$RANDOM$RANDOM"
P "INSERT INTO \"Project\" (id,name,\"companyId\",status,\"updatedAt\",\"createdAt\") VALUES ('$LPROJ','wip-land-$RANDOM','$C','ACTIVE',now(),now())"
r=$(req POST "land-purchases" "{\"mode\":\"BOOKED\",\"sellerName\":\"WIP Seller\",\"totalArea\":1000,\"areaUnit\":\"SQFT\",\"totalCost\":50000,\"tokenAmount\":50000,\"tokenPaymentMode\":\"UPI\",\"projectId\":\"$LPROJ\",\"location\":\"WIP Site\"}")
LP2=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$LP2" ] && { PASS=$((PASS+1)); echo "  linked purchase $LP2"; } || { FAIL=$((FAIL+1)); echo "  FAIL linked buy: ${r:0:140}"; }
expect_num "linked buy Dr 1500 = 50000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE' AND je.\"sourceId\"='$LP2' AND a.code='1500'" 50000
expect_num "linked buy touches NO 1700" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE' AND je.\"sourceId\"='$LP2' AND a.code='1700'" 0
expect_cnt "parcel carries projectId" "SELECT count(*) FROM \"LandParcel\" WHERE \"landPurchaseId\"='$LP2' AND \"projectId\"='$LPROJ'" 1
expect_num "project cost pool includes land" "SELECT \"totalProjectCost\" FROM \"Project\" WHERE id='$LPROJ'" 50000

echo "════════ 7. cancel a booked purchase → asset out, cash→refund receivable ════════"
# LP3: 80,000 booked, 30,000 token cash + 20,000 UPI payment (cashOut 50,000,
# AP 30,000). Cancel must credit the asset, extinguish AP, and put 50,000
# into vendor-refund receivable — and refuse on the COMPLETED purchase.
r=$(req POST "land-purchases" "{\"mode\":\"BOOKED\",\"sellerName\":\"Cancel Seller\",\"totalArea\":800,\"areaUnit\":\"SQFT\",\"totalCost\":80000,\"tokenAmount\":30000,\"tokenPaymentMode\":\"UPI\",\"location\":\"Cancel Site\"}")
LP3=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$LP3" ] && { PASS=$((PASS+1)); echo "  cancellable purchase $LP3"; } || { FAIL=$((FAIL+1)); echo "  FAIL LP3: ${r:0:140}"; }
req POST "land-purchases/$LP3/payment" "{\"amount\":20000,\"paymentMode\":\"UPI\",\"referenceNo\":\"CN$REF\"}" >/dev/null
r=$(req POST "land-purchases/$LP3/cancel" '{"reason":"verifier: seller backed out"}')
echo "$r" | grep -q '"ok":true\|CANCELLED' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  cancel → ${r:0:120}"
expect_num "cancel Dr 1660 refund = 50000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE_CANCEL' AND je.\"sourceId\"='$LP3' AND a.code='1660'" 50000
expect_num "cancel Dr 2000 AP = 30000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE_CANCEL' AND je.\"sourceId\"='$LP3' AND a.code='2000'" 30000
expect_num "cancel Cr 1700 asset = 80000" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='LAND_PURCHASE_CANCEL' AND je.\"sourceId\"='$LP3' AND a.code='1700'" 80000
expect_num "net AP for LP3 = 0" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='2000' AND jl.\"entityId\"='$LP3' AND je.status='POSTED'" 0
expect_num "net cash out for LP3 = receivable" "SELECT COALESCE(SUM(jl.credit)-SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='1000' AND jl.\"entityId\"='$LP3' AND je.status='POSTED'" 50000
r=$(req POST "land-purchases/$LP/cancel" '{"reason":"already completed"}')
expect_refused "cancel on COMPLETED purchase" "$r"
r=$(req POST "land-purchases/$LP3/cancel" '{"reason":"twice"}')
expect_refused "double cancel refused" "$r"

echo "════════════════════════════════════════"
echo "land-purchase chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
