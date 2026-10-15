#!/usr/bin/env bash
# Subcontractor RA-bill chain — the construction-specific money math.
#
# Scenario (all numbers asserted against the DB, not the API response):
#   advance ₹1,000 · advance recovery 10% of gross · retention 5% · TDS 2% (COMPANY)
#   rate ₹100/unit
#   Bill 1: MB 50u  → gross 5,000 · ret 250 · TDS 100 · adv 500 · net 4,150
#   Bill 2: MB 90u  → gross 9,000 · ret 450 · TDS 180 · adv must be 500 (only ₹500
#                     of advance is left once Bill 1 is accounted for) · net 7,870
#   Bill 3: MB 10u  → gross 1,000 · adv must be 0 (advance fully recovered)
#
# Business rule: advance recovery is capped at the advance still outstanding
# ACROSS ALL LIVE BILLS — a SUBMITTED bill's pending recovery counts, otherwise
# two bills in review can each recover the same rupees.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-ra-bill-chain.sh
# MUTATES the dev DB (creates a synthetic work order + MB entries).

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
PROJ="cmtwhwzer000pvlt3cth8e8qo"                  # apex center
SUB="cmv15ajxt0001vle27fpu0aec"                   # seeded subcontractor

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
reqRetry() { local r i; for i in 1 2 3 4; do r=$(req "$@"); echo "$r" | grep -qi "conflict" || break; sleep 2; done; echo "$r"; }
expect_num() { # label sql want
  got=$(P "$2")
  ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.02")
  [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
expect() {
  got=$(P "SELECT $4::text FROM \"$2\" WHERE id='$3'")
  [ "$got" = "$5" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $5 got ${got:-<none>}"; }
}
uid() { echo "vfy$(date +%s)$RANDOM"; }

echo "════════ 0. synthetic ACTIVE work order (advance ₹1,000 paid, 10% recovery) ════════"
WO=$(uid); L=$(uid); MB1=$(uid); MB2=$(uid); MB3=$(uid); BOQ=$(uid)
# Own BOQ line: completion blocks on ANY approved-unbilled MB entry for the WO's BOQ
# items, so sharing a seeded line lets other test data strand this scenario.
P "INSERT INTO \"BoqItem\" (id,\"projectId\",type,\"serialNo\",description,unit,\"estimatedQty\",rate,\"sortOrder\",\"updatedAt\") VALUES ('$BOQ','$PROJ','LINE_ITEM','RA-VFY-$RANDOM','ra chain verify line','cum',1000,100,0,now())"
P "INSERT INTO \"SubcontractorWorkOrder\" (id,\"workOrderNumber\",\"projectId\",\"subcontractorId\",\"companyId\",\"workTitle\",status,\"advanceAmount\",\"advanceRecoveryPct\",\"retentionPct\",\"tdsPct\",\"tdsCategory\",\"updatedAt\",\"createdAt\") VALUES ('$WO','WO-RA-$RANDOM','$PROJ','$SUB','$C','ra chain verify','ACTIVE',0,10,5,2,'COMPANY',now(),now())"
# Pay the advance via the API — SQL-seeding advanceAmount skips payAdvance's
# Dr-1600 leg while recoveries/write-offs credit it, drifting the account.
req POST "work-orders/$WO" '{"action":"payAdvance","amount":1000,"paymentMode":"CASH"}' >/dev/null
P "INSERT INTO \"SubcontractorWorkOrderLine\" (id,\"workOrderId\",\"boqItemId\",\"agreedRate\",\"cumulativeQty\",\"cumulativeAmount\") VALUES ('$L','$WO','$BOQ',100,0,0)"
for pair in "$MB1:50" "$MB2:90" "$MB3:10"; do
  id=${pair%%:*}; q=${pair##*:}
  P "INSERT INTO \"MeasurementBookEntry\" (id,\"projectId\",\"boqItemId\",\"mbNumber\",\"measuredQty\",\"cumulativeQty\",description,status,\"updatedAt\",\"createdAt\") VALUES ('$id','$PROJ','$BOQ','MB-RA-$RANDOM',$q,$q,'ra verify','APPROVED',now(),now())"
done
TODAY=$(date -u +%Y-%m-%dT00:00:00.000Z); START=$(date -u -v-30d +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT00:00:00.000Z)

echo "════════ 1. bill 1 (MB 50u) — deductions and net ════════"
r=$(reqRetry POST "ra-bills" "{\"workOrderId\":\"$WO\",\"periodFrom\":\"$START\",\"periodTo\":\"$TODAY\",\"mbEntryIds\":[\"$MB1\"]}")
B1=$(P "SELECT id FROM \"RaBill\" WHERE \"workOrderId\"='$WO' ORDER BY \"createdAt\" LIMIT 1")
[ -n "$B1" ] && { PASS=$((PASS+1)); echo "  PASS bill 1 created"; } || { FAIL=$((FAIL+1)); echo "  FAIL bill 1: ${r:0:160}"; }
expect_num "b1 gross" "SELECT \"grossAmount\" FROM \"RaBill\" WHERE id='$B1'" 5000
expect_num "b1 retention 5%" "SELECT \"retentionAmount\" FROM \"RaBill\" WHERE id='$B1'" 250
expect_num "b1 TDS 2%" "SELECT \"tdsAmount\" FROM \"RaBill\" WHERE id='$B1'" 100
expect_num "b1 advance 10%" "SELECT \"advanceRecovery\" FROM \"RaBill\" WHERE id='$B1'" 500
expect_num "b1 net" "SELECT \"netPayable\" FROM \"RaBill\" WHERE id='$B1'" 4150
expect "b1 auto-submitted" RaBill "$B1" '"status"' SUBMITTED
expect "mb1 claimed by bill 1" MeasurementBookEntry "$MB1" '"raBillLineId" IS NOT NULL' true

echo "════════ 2. re-billing a claimed MB entry → rejected ════════"
r=$(reqRetry POST "ra-bills" "{\"workOrderId\":\"$WO\",\"periodFrom\":\"$START\",\"periodTo\":\"$TODAY\",\"mbEntryIds\":[\"$MB1\"]}")
echo "$r" | grep -qiE "error|not approved|unbilled" && { PASS=$((PASS+1)); echo "  PASS double-bill blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL double-bill accepted: ${r:0:140}"; }

echo "════════ 3. bill 2 created while bill 1 is still SUBMITTED ════════"
r=$(reqRetry POST "ra-bills" "{\"workOrderId\":\"$WO\",\"periodFrom\":\"$START\",\"periodTo\":\"$TODAY\",\"mbEntryIds\":[\"$MB2\"]}")
B2=$(P "SELECT id FROM \"RaBill\" WHERE \"workOrderId\"='$WO' ORDER BY \"createdAt\" DESC LIMIT 1")
[ "$B2" != "$B1" ] && [ -n "$B2" ] && { PASS=$((PASS+1)); echo "  PASS bill 2 created"; } || { FAIL=$((FAIL+1)); echo "  FAIL bill 2: ${r:0:160}"; }
expect_num "b2 gross" "SELECT \"grossAmount\" FROM \"RaBill\" WHERE id='$B2'" 9000
# 10% of 9,000 = 900, but only 500 of the 1,000 advance is still unrecovered
# (bill 1 already claims 500 and is not yet approved).
expect_num "b2 advance capped at OUTSTANDING incl. pending bill 1" "SELECT \"advanceRecovery\" FROM \"RaBill\" WHERE id='$B2'" 500
expect_num "b2 net" "SELECT \"netPayable\" FROM \"RaBill\" WHERE id='$B2'" 7870

echo "════════ 4. approve bills 1 and 2 → total recovery never exceeds advance ════════"
reqRetry PATCH "ra-bills/$B1" '{"action":"approve"}' >/dev/null
reqRetry PATCH "ra-bills/$B2" '{"action":"approve"}' >/dev/null
expect "bill 1 approved" RaBill "$B1" '"status"' APPROVED
expect "bill 2 approved" RaBill "$B2" '"status"' APPROVED
expect_num "total advance recovered ≤ advance (1000)" "SELECT coalesce(sum(\"advanceRecovery\"),0) FROM \"RaBill\" WHERE \"workOrderId\"='$WO' AND status IN ('APPROVED','PAID')" 1000
expect_num "WO totalWorkDone = gross 1+2" "SELECT \"totalWorkDone\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 14000
expect_num "WO totalDeductions = b1 (850) + b2 (1130)" "SELECT \"totalDeductions\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 1980
expect_num "WO retentionBalance = 250 + 450" "SELECT \"retentionBalance\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 700

echo "════════ 5. advance exhausted → bill 3 recovers nothing ════════"
r=$(reqRetry POST "ra-bills" "{\"workOrderId\":\"$WO\",\"periodFrom\":\"$START\",\"periodTo\":\"$TODAY\",\"mbEntryIds\":[\"$MB3\"]}")
B3=$(P "SELECT id FROM \"RaBill\" WHERE \"workOrderId\"='$WO' ORDER BY \"createdAt\" DESC LIMIT 1")
expect_num "b3 advance = 0 (exhausted)" "SELECT \"advanceRecovery\" FROM \"RaBill\" WHERE id='$B3'" 0
expect_num "b3 net = 1000 − 50 ret − 20 TDS" "SELECT \"netPayable\" FROM \"RaBill\" WHERE id='$B3'" 930

echo "════════ 6. pay bill 1 — maker-checker: creator cannot pay, FINANCE_HEAD can ════════"
r=$(reqRetry PATCH "ra-bills/$B1" '{"action":"pay","paymentMode":"NEFT","paymentReference":"UTR-RA-'$RANDOM'"}')
echo "$r" | grep -qiE "cannot pay|403" && { PASS=$((PASS+1)); echo "  PASS owner self-pay blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL owner self-pay accepted: ${r:0:140}"; }
FHJAR=/tmp/nirman-cookies-fh.txt
fh_email=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d '{"role":"FINANCE_HEAD"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['email'])")
fh_pw=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d '{"role":"FINANCE_HEAD"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['password'])")
curl -s -c "$FHJAR" -o /dev/null -X POST "$BASE/api/auth/sign-in/email" -H "Content-Type: application/json" -H "origin: $BASE" -d "{\"email\":\"$fh_email\",\"password\":\"$fh_pw\"}"
JAR="$FHJAR"
r=$(reqRetry PATCH "ra-bills/$B1" '{"action":"pay","paymentMode":"NEFT","paymentReference":"UTR-RA-'$RANDOM'"}')
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
expect "bill 1 paid" RaBill "$B1" '"status"' PAID
expect_num "WO totalPaid = bill 1 net" "SELECT \"totalPaid\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 4150

echo "════════ 7. GL — bill 1 journal balances, WIP = gross ════════"
expect_num "GL WIP debit = gross" "SELECT coalesce(sum(jl.\"debit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='1500' AND je.\"sourceId\"='$B1'" 5000
bal=$(P "SELECT coalesce(sum(jl.\"debit\"::numeric)-sum(jl.\"credit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceId\"='$B1'")
[ "$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${bal:-0}::numeric,0)) < 0.005")" = "t" ] && { PASS=$((PASS+1)); echo "  PASS bill 1 journal balanced"; } || { FAIL=$((FAIL+1)); echo "  FAIL bill 1 journal unbalanced: $bal"; }

echo "════════ 8. retention is NOT releasable on an ACTIVE work order ════════"
r=$(reqRetry PATCH "work-orders/$WO" '{"action":"release-retention"}')
echo "$r" | grep -q "completed work orders" && { PASS=$((PASS+1)); echo "  PASS release on ACTIVE WO refused"; } || { FAIL=$((FAIL+1)); echo "  FAIL release on ACTIVE WO: ${r:0:140}"; }
expect_num "retention unchanged after refused release" "SELECT \"retentionBalance\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 700

echo "════════ 9. completion → defence period → retention release → conservation ════════"
# Completion refuses while any bill is still in flight (bill 3 is SUBMITTED).
r=$(reqRetry PATCH "work-orders/$WO" '{"action":"complete"}')
echo "$r" | grep -qi "pending" && { PASS=$((PASS+1)); echo "  PASS completion blocked by in-flight bill"; } || { FAIL=$((FAIL+1)); echo "  FAIL completion allowed with in-flight bill: ${r:0:140}"; }
reqRetry PATCH "ra-bills/$B3" '{"action":"approve"}' >/dev/null
JAR="$FHJAR"
reqRetry PATCH "ra-bills/$B2" '{"action":"pay","paymentMode":"NEFT","paymentReference":"UTR-B2-'$RANDOM'"}' >/dev/null
reqRetry PATCH "ra-bills/$B3" '{"action":"pay","paymentMode":"NEFT","paymentReference":"UTR-B3-'$RANDOM'"}' >/dev/null
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
expect "bill 2 paid" RaBill "$B2" '"status"' PAID
expect "bill 3 paid" RaBill "$B3" '"status"' PAID
r=$(reqRetry PATCH "work-orders/$WO" '{"action":"complete"}')
expect "WO completed" SubcontractorWorkOrder "$WO" '"status"' COMPLETED
expect_num "retention held = 250 + 450 + 50" "SELECT \"retentionBalance\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 750
# Retention is held for the defect-liability period — release without an override is refused.
r=$(reqRetry PATCH "work-orders/$WO" '{"action":"release-retention"}')
echo "$r" | grep -qi "defect liability" && { PASS=$((PASS+1)); echo "  PASS defect period enforced"; } || { FAIL=$((FAIL+1)); echo "  FAIL retention released inside defect period: ${r:0:140}"; }
expect_num "retention still held" "SELECT \"retentionBalance\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 750
# Early release with a documented reason is allowed (FINANCE_HEAD holds RA_PAY).
JAR="$FHJAR"
r=$(reqRetry PATCH "work-orders/$WO" '{"action":"release-retention","overrideReason":"client waived defect period in writing","paymentMode":"NEFT"}')
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
expect "WO closed after release" SubcontractorWorkOrder "$WO" '"status"' CLOSED
expect_num "retention balance zeroed" "SELECT \"retentionBalance\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 0
expect_num "GL retention released (Dr 2600)" "SELECT coalesce(sum(jl.\"debit\"::numeric),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='2600' AND je.\"sourceId\"='$WO'" 750

echo "════════ 10. conservation — gross = net paid + retention + TDS + advance recovered ════════"
expect_num "work done 15,000" "SELECT \"totalWorkDone\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 15000
expect_num "net paid + retention released = 13,700" "SELECT \"totalPaid\" FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 13700
expect_num "TDS 100+180+20 = 300 deducted" "SELECT coalesce(sum(\"tdsAmount\"),0) FROM \"RaBill\" WHERE \"workOrderId\"='$WO' AND status IN ('APPROVED','PAID')" 300
expect_num "advance recovered 1000 = advance" "SELECT coalesce(sum(\"advanceRecovery\"),0) FROM \"RaBill\" WHERE \"workOrderId\"='$WO' AND status IN ('APPROVED','PAID')" 1000
expect_num "identity: 15000 = 13700 + 300 + 1000" "SELECT \"totalWorkDone\" - \"totalPaid\" - 300 - 1000 FROM \"SubcontractorWorkOrder\" WHERE id='$WO'" 0

echo; echo "════════ RESULT: $PASS passed, $FAIL failed ════════"
[ "$FAIL" -eq 0 ]
