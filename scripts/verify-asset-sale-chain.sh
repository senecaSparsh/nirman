#!/usr/bin/env bash
# Land sale lifecycle — cancel with an uncleared cheque, completion, and the
# Section 194-IA TDS (1% on property ≥ ₹50 lakh) that the buyer deducts.
#
# Every assertion is checked against the GL (net per account for the sale),
# not just status fields:
#   A. cheque deposit posts at booking (Dr Cash / Cr Customer Deposit).
#      Cancelling must net the sale back to zero — an uncleared cheque that was
#      posted still has to be reversed, or the ledger keeps phantom cash.
#   B. completion settles deposit + final cash against AR and books revenue.
#   D. ₹60 lakh sale: buyer deducts 1% TDS (₹60,000). The seller's books must
#      show that amount as TDS Receivable (1960), not as an open customer AR.
#
# Creates three synthetic land parcels per run (no demo inventory consumed).
# Usage: BASE=http://localhost:3000 ./scripts/verify-asset-sale-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
CUST="cmtwi53250001vljm6ru892z6"                  # seeded customer
LP="cmv2i9h3x0005vlwavyovr9qy"                    # seeded land purchase

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
reqRetry() { local r i; for i in 1 2 3 4; do r=$(req "$@"); echo "$r" | grep -qi "conflict" || break; sleep 2; done; echo "$r"; }
ok()   { PASS=$((PASS+1)); echo "  PASS $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
expect() { # label table id column want
  got=$(P "SELECT $4::text FROM \"$2\" WHERE id='$3'")
  [ "$got" = "$5" ] && ok "$1 → $got" || bad "$1: want $5 got ${got:-<none>}"
}
expect_num() { # label sql want
  got=$(P "$2")
  [ "$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.02")" = "t" ] && ok "$1 → $got" || bad "$1: want $3 got ${got:-<none>}"
}
# Net debit−credit on an account for everything belonging to this sale: JEs sourced
# to the sale or its payments, and lines tagged to them.
gl_net() { # accountCode saleId
  P "SELECT coalesce(sum(jl.\"debit\"::numeric)-sum(jl.\"credit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='$1' AND (je.\"sourceId\"='$2' OR je.\"sourceId\" IN (SELECT id FROM \"AssetSalePayment\" WHERE \"assetSaleId\"='$2') OR jl.\"entityId\"='$2' OR jl.\"entityId\" IN (SELECT id FROM \"AssetSalePayment\" WHERE \"assetSaleId\"='$2'))"
}
expect_gl() { # label accountCode saleId want
  got=$(gl_net "$2" "$3")
  [ "$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-0}::numeric,0) - $4::numeric) < 0.02")" = "t" ] && ok "$1 → $got" || bad "$1: want $4 got ${got:-0}"
}
parcel() { # number → new AVAILABLE land parcel
  local id="vfylp$(date +%s)$RANDOM$1"
  P "INSERT INTO \"LandParcel\" (id,\"landPurchaseId\",number,area,status,\"updatedAt\") VALUES ('$id','$LP','VFY-$RANDOM-$1',1000,'AVAILABLE',now())" >/dev/null
  echo "$id"
}
sale_of() { P "SELECT id FROM \"AssetSale\" WHERE \"landParcelId\"='$1' ORDER BY \"createdAt\" DESC LIMIT 1"; }
sell() { # parcel price initialPayment mode [chequeNo]
  local body="{\"assetType\":\"LAND\",\"landParcelId\":\"$1\",\"customerId\":\"$CUST\",\"salePrice\":$2,\"gstRate\":0,\"initialPayment\":$3,\"initialPaymentMode\":\"$4\""
  [ -n "${5:-}" ] && body="$body,\"initialChequeNo\":\"$5\",\"initialChequeBank\":\"VFY BANK\""
  reqRetry POST "sales" "$body}"
}

echo "════════ A. cancel a sale whose ₹2,00,000 cheque never cleared ════════"
PA=$(parcel A)
r=$(sell "$PA" 1000000 200000 CHEQUE "CHQ-A-$RANDOM")
SA=$(sale_of "$PA")
[ -n "$SA" ] && ok "sale created" || { bad "sale create: ${r:0:140}"; }
expect "stage after cheque deposit" AssetSale "$SA" '"saleStage"' DEPOSIT_RECEIVED
expect_gl "cash posted at booking (uncleared)" 1000 "$SA" 200000
expect_gl "customer deposit liability posted" 2500 "$SA" -200000
r=$(reqRetry PATCH "sales/$SA" '{"action":"cancel"}')
expect "sale cancelled" AssetSale "$SA" '"status"' CANCELLED
expect_gl "cash fully reversed on cancel" 1000 "$SA" 0
expect_gl "customer deposit fully reversed on cancel" 2500 "$SA" 0
expect "parcel back to AVAILABLE" LandParcel "$PA" '"status"' AVAILABLE
CHQ=$(P "SELECT id FROM \"AssetSalePayment\" WHERE \"assetSaleId\"='$SA' LIMIT 1")
r=$(reqRetry POST "sales/payments/$CHQ/cheque" '{"action":"clear"}')
echo "$r" | grep -qiE "error|cancel" && ok "cheque cannot clear on cancelled sale" || bad "cheque cleared on cancelled sale: ${r:0:120}"

echo "════════ B. cash deposit → completion (₹10 lakh, land, no 194-IA) ════════"
PB=$(parcel B)
sell "$PB" 1000000 300000 NEFT "" >/dev/null
SB=$(sale_of "$PB")
expect "stage after deposit" AssetSale "$SB" '"saleStage"' DEPOSIT_RECEIVED
r=$(reqRetry POST "sales/$SB" '{"action":"complete"}')
echo "$r" | grep -qi "registry" && ok "completion refused without registry document" || bad "completed without registry: ${r:0:120}"
r=$(reqRetry POST "sales/$SB" '{"action":"complete","registryDocumentUrl":"https://example.test/deed-B.pdf","registryDocumentName":"deed-B.pdf"}')
expect "sale completed" AssetSale "$SB" '"saleStage"' COMPLETED
expect "fully paid" AssetSale "$SB" '"paymentStatus"' PAID
expect "parcel SOLD and linked" LandParcel "$PB" '"status"' SOLD
expect_gl "revenue recognised = sale price" 4000 "$SB" -1000000
expect_gl "receivable fully settled" 1200 "$SB" 0
expect_gl "deposit liability settled" 2500 "$SB" 0
r=$(reqRetry POST "sales/$SB" '{"action":"complete","registryDocumentUrl":"https://example.test/deed-B.pdf"}')
echo "$r" | grep -qi "already completed" && ok "second completion refused" || bad "second completion accepted: ${r:0:120}"

echo "════════ D. ₹60 lakh land sale — buyer deducts 1% 194-IA TDS ════════"
PD=$(parcel D)
sell "$PD" 6000000 1000000 NEFT "" >/dev/null
SD=$(sale_of "$PD")
# Buyer owes 50,00,000 after the deposit; deducts ₹60,000 TDS and pays ₹49,40,000 net.
r=$(reqRetry POST "sales/$SD" '{"action":"complete","registryDocumentUrl":"https://example.test/deed-D.pdf","finalPaymentAmount":4940000}')
expect_num "194-IA TDS recorded on sale" "SELECT \"tdsAmount\" FROM \"AssetSale\" WHERE id='$SD'" 60000
expect_gl "TDS booked as receivable from buyer (1960)" 1960 "$SD" 60000
expect_gl "receivable closed (TDS is not an open customer debt)" 1200 "$SD" 0
expect "sale fully paid once TDS is recognised" AssetSale "$SD" '"paymentStatus"' PAID

echo; echo "════════ RESULT: $PASS passed, $FAIL failed ════════"
[ "$FAIL" -eq 0 ]
