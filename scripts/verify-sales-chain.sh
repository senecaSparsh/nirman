#!/usr/bin/env bash
# Sales receivable-chain verification — deposit/payment stage gates, cheque
# clearing semantics (uncleared cheques don't move paymentStatus), duplicate
# bank-reference guard, over-payment guard, and the GL entry per payment.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-sales-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
CUST="cmtwi53250001vljm6ru892z6"                  # seeded customer

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
reqRetry() { local r i; for i in 1 2 3 4; do r=$(req "$@"); echo "$r" | grep -qi "conflict" || break; sleep 2; done; echo "$r"; }
expect() {
  got=$(P "SELECT $4::text FROM \"$2\" WHERE id='$3'")
  [ "$got" = "$5" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $5 got ${got:-<none>}"; }
}
expect_num() {
  got=$(P "$2")
  ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.02")
  [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
uid() { echo "vfy$(date +%s)$RANDOM"; }

echo "════════ 0. synthetic COMPLETED sale (₹10,000) ════════"
SALE=$(uid); PEND=$(uid)
P "INSERT INTO \"AssetSale\" (id,\"saleNumber\",\"assetType\",\"customerId\",\"companyId\",\"salePrice\",\"gstAmount\",\"saleStage\",status,\"paymentStatus\",\"updatedAt\",\"createdAt\") VALUES ('$SALE','AS-CH-$RANDOM','LAND','$CUST','$C',10000,0,'COMPLETED','ACTIVE','PENDING',now(),now())"
P "INSERT INTO \"AssetSale\" (id,\"saleNumber\",\"assetType\",\"customerId\",\"companyId\",\"salePrice\",\"gstAmount\",\"saleStage\",status,\"paymentStatus\",\"updatedAt\",\"createdAt\") VALUES ('$PEND','AS-CHP-$RANDOM','LAND','$CUST','$C',10000,0,'PENDING','ACTIVE','PENDING',now(),now())"

echo "════════ 1. payment on pre-completion sale → blocked ════════"
r=$(reqRetry POST "sales/$PEND" '{"action":"payment","amount":500,"mode":"UPI"}')
echo "$r" | grep -qiE "completed|deposit|error" && { PASS=$((PASS+1)); echo "  PASS pre-completion pay blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL pre-completion pay: ${r:0:140}"; }

echo "════════ 2. deposit on pending sale (liability, not revenue) ════════"
r=$(reqRetry POST "sales/$PEND" '{"action":"deposit","depositAmount":1500,"paymentMode":"UPI","reference":"DEP-CH-'$RANDOM'"}')
echo "$r" | grep -qE '"ok":true' && { PASS=$((PASS+1)); echo "  PASS deposit recorded"; } || { FAIL=$((FAIL+1)); echo "  FAIL deposit: ${r:0:140}"; }
# Deposit is a customer advance — must NOT credit the AR/revenue accounts.
n=$(P "SELECT count(*) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='4000' AND je.\"sourceId\"='$PEND'")
[ "${n:-0}" = "0" ] && { PASS=$((PASS+1)); echo "  PASS no revenue on deposit"; } || { FAIL=$((FAIL+1)); echo "  FAIL deposit posted revenue"; }

echo "════════ 3. payment → PARTIAL + GL Dr Cash / Cr AR ════════"
r=$(reqRetry POST "sales/$SALE" '{"action":"payment","amount":4000,"mode":"UPI","reference":"UTR-CH-'$RANDOM'"}')
PAY1=$(echo "$r" | grep -oE '"paymentId":"[^"]+"' | cut -d'"' -f4)
[ -n "$PAY1" ] || PAY1=$(P "SELECT id FROM \"AssetSalePayment\" WHERE \"assetSaleId\"='$SALE' ORDER BY \"paymentDate\" DESC LIMIT 1")
expect "payment → PARTIAL" AssetSale "$SALE" '"paymentStatus"' PARTIAL
expect_num "GL cash 4000" "SELECT coalesce(sum(\"debit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='1000' AND je.\"sourceId\"='$PAY1'" 4000
expect_num "GL AR 4000" "SELECT coalesce(sum(\"credit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='1200' AND je.\"sourceId\"='$PAY1'" 4000

echo "════════ 4. cheque pending → status unchanged until cleared ════════"
r=$(reqRetry POST "sales/$SALE" '{"action":"payment","amount":3000,"mode":"CHEQUE","chequeNo":"CHQ-CH-'$RANDOM'"}')
CHQPAY=$(P "SELECT id FROM \"AssetSalePayment\" WHERE \"assetSaleId\"='$SALE' AND mode='CHEQUE' ORDER BY \"paymentDate\" DESC LIMIT 1")
# Uncleared cheque must NOT move paymentStatus (still PARTIAL from 4000 cash).
expect "cheque pending keeps PARTIAL" AssetSale "$SALE" '"paymentStatus"' PARTIAL
expect "cheque row pending" AssetSalePayment "$CHQPAY" '"chequeStatus"' PENDING

echo "════════ 5. clear cheque → clears toward PAID ════════"
r=$(reqRetry POST "sales/payments/$CHQPAY/cheque" '{"action":"clear"}')
expect "cheque cleared" AssetSalePayment "$CHQPAY" '"chequeStatus"' CLEARED
# cleared = 4000 + 3000 = 7000 of 10000 → still PARTIAL
expect "7000 cleared stays PARTIAL" AssetSale "$SALE" '"paymentStatus"' PARTIAL

echo "════════ 6. over-pay + duplicate-reference guards ════════"
r=$(reqRetry POST "sales/$SALE" '{"action":"payment","amount":99999,"mode":"UPI","reference":"UTR-OVR-'$RANDOM'"}')
echo "$r" | grep -qiE "overpay|exceeds|error" && { PASS=$((PASS+1)); echo "  PASS over-pay blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL over-pay accepted: ${r:0:140}"; }
# Reuse the first payment's reference on another sale → must reject.
REF=$(P "SELECT reference FROM \"AssetSalePayment\" WHERE id='$PAY1'")
r=$(reqRetry POST "sales/$SALE" "{\"action\":\"payment\",\"amount\":100,\"mode\":\"UPI\",\"reference\":\"$REF\"}")
echo "$r" | grep -qiE "already recorded|duplicate|error" && { PASS=$((PASS+1)); echo "  PASS dupe UTR blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL dupe UTR accepted: ${r:0:140}"; }

echo "════════ 7. final payment → PAID ════════"
r=$(reqRetry POST "sales/$SALE" '{"action":"payment","amount":3000,"mode":"UPI","reference":"UTR-FIN-'$RANDOM'"}')
expect "fully paid" AssetSale "$SALE" '"paymentStatus"' PAID

echo; echo "════════ RESULT: $PASS passed, $FAIL failed ════════"
[ "$FAIL" -eq 0 ]
