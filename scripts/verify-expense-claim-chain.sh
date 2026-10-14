#!/usr/bin/env bash
# Expense-claim chain verification — reimbursement flow:
#   create claim (₹1000 + 18% GST) → submit (OWNER auto-approves —
#   no higher approver exists) → Expense row + GL Dr 6000 / Dr 1400 /
#   Cr 2800 Reimbursements Payable → pay → Dr 2800 / Cr 1000, status PAID.
#   Guards: pay before approve refused; double pay refused; reject after
#   approve refused.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-expense-claim-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
PROJ="cmtwhwzer000pvlt3cth8e8qo"                     # apex center
ME="cmtv3x4uq0002vlp05o8po34q"                       # session user (OWNER)

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

echo "════════ 1. create + submit → auto-approve → GL ════════"
r=$(req POST "expense-claims" "{\"claimantId\":\"$ME\",\"projectId\":\"$PROJ\",\"description\":\"verifier claim\",\"lines\":[{\"category\":\"Travel\",\"amount\":1000,\"gstRate\":18}]}")
CL=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$CL" ] && { PASS=$((PASS+1)); echo "  claim $CL"; } || { FAIL=$((FAIL+1)); echo "  FAIL create: ${r:0:150}"; exit 1; }

# pay before submit must refuse
r=$(req PATCH "expense-claims/$CL" '{"action":"pay","paymentMode":"UPI"}')
expect_refused "pay before approval" "$r"

r=$(req PATCH "expense-claims/$CL" '{"action":"submit"}')
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  submit → ${r:0:80}"
ST=$(P "SELECT status FROM \"ExpenseClaim\" WHERE id='$CL'")
[ "$ST" = "APPROVED" ] && { PASS=$((PASS+1)); echo "  PASS OWNER submit auto-approved → $ST"; } || { FAIL=$((FAIL+1)); echo "  FAIL status: want APPROVED got $ST"; }

# GL: Dr expense 1000 + Dr input GST 180 + Cr reimbursements 1180 —
# approve posts EXPENSE_CLAIM_APPROVAL keyed by the created Expense's id.
EX=$(P "SELECT id FROM \"Expense\" WHERE \"expenseClaimId\"='$CL' ORDER BY \"createdAt\" DESC LIMIT 1")
[ -n "$EX" ] && { PASS=$((PASS+1)); echo "  expense row $EX"; } || { FAIL=$((FAIL+1)); echo "  FAIL expense row missing"; }
expect_num "Dr OPEX 1000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='EXPENSE_CLAIM_APPROVAL' AND je.\"sourceId\"='$EX' AND a.code='6000'" 1000
expect_num "Dr ITC 180" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='EXPENSE_CLAIM_APPROVAL' AND je.\"sourceId\"='$EX' AND a.code='1400'" 180
expect_num "Cr ReimbPayable 1180" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='EXPENSE_CLAIM_APPROVAL' AND je.\"sourceId\"='$EX' AND a.code='2800'" 1180

echo "════════ 2. pay → settle the payable ════════"
r=$(req PATCH "expense-claims/$CL" '{"action":"reject","reason":"x"}')
expect_refused "reject after approve" "$r"
r=$(req PATCH "expense-claims/$CL" '{"action":"pay","paymentMode":"UPI","referenceNo":"EC-'$(date +%s)'"}')
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  pay → ${r:0:80}"
ST=$(P "SELECT status FROM \"ExpenseClaim\" WHERE id='$CL'")
[ "$ST" = "PAID" ] && { PASS=$((PASS+1)); echo "  PASS status PAID"; } || { FAIL=$((FAIL+1)); echo "  FAIL status: $ST"; }
expect_num "Dr ReimbPayable 1180" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='EXPENSE_CLAIM_PAYMENT' AND je.\"sourceId\"='$CL' AND a.code='2800'" 1180
expect_num "Cr Cash 1180" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='EXPENSE_CLAIM_PAYMENT' AND je.\"sourceId\"='$CL' AND a.code='1000'" 1180
# net liability for the claim = 0 (approve credits on the expense JE,
# pay debits on the claim JE — sum across both)
expect_num "net 2800 for claim = 0" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.status='POSTED' AND a.code='2800' AND ((je.\"sourceType\"='EXPENSE_CLAIM_APPROVAL' AND je.\"sourceId\"='$EX') OR (je.\"sourceType\"='EXPENSE_CLAIM_PAYMENT' AND je.\"sourceId\"='$CL'))" 0
r=$(req PATCH "expense-claims/$CL" '{"action":"pay","paymentMode":"UPI"}')
expect_refused "double pay" "$r"

echo "════════════════════════════════════════"
echo "expense-claim chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
