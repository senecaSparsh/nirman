#!/usr/bin/env bash
# Petty-cash chain verification:
#   float ₹5000 → Dr 1200(PETTY_CASH) / Cr 1000 — cash moves to the imprest
#   topup ₹2000 → same legs again
#   spend ₹1500 → Dr 6000 expense / Cr 1200 petty cash + auto-APPROVED expense
#   guards: spend > float balance refused; GL 1200 net = float balance
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-petty-cash-chain.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
PROJ="cmtwhwzer000pvlt3cth8e8qo"                     # apex center

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*|*'"id"'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

PCASH_ACCT=$(P "SELECT id FROM \"GlAccount\" WHERE \"companyId\"='$C' AND code='1050'")
[ -z "$PCASH_ACCT" ] && { echo "  · 1200 Petty Cash account missing — checking actual code"; PCASH_ACCT=$(P "SELECT code FROM \"GlAccount\" WHERE \"companyId\"='$C' AND name ILIKE '%petty%'"); echo "  · petty code = $PCASH_ACCT"; }

echo "════════ 1. float ₹5000 ════════"
r=$(req POST "petty-cash" "{\"name\":\"verifier-float-$(date +%s)\",\"floatAmount\":5000,\"projectId\":\"$PROJ\"}")
FL=$(echo "$r" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$FL" ] && { PASS=$((PASS+1)); echo "  float $FL"; } || { FAIL=$((FAIL+1)); echo "  FAIL float: ${r:0:140}"; exit 1; }
expect_num "Dr PettyCash 5000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceId\"='$FL' AND jl.\"accountId\"='$PCASH_ACCT' AND je.status='POSTED'" 5000
expect_num "Cr Cash 5000" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceId\"='$FL' AND a.code='1000' AND je.status='POSTED'" 5000
expect_num "float balance = 5000" "SELECT \"floatAmount\" FROM \"PettyCashFloat\" WHERE id='$FL'" 5000

echo "════════ 2. overspend refused, topup ₹2000 ════════"
r=$(req POST "petty-cash/$FL/spend" '{"amount":99999,"category":"Misc"}')
expect_refused "spend > balance" "$r"
r=$(req POST "petty-cash/$FL/topups" '{"amount":2000}')
TOP=$(P "SELECT id FROM \"PettyCashTopUp\" WHERE \"floatId\"='$FL' AND amount=2000 ORDER BY date DESC, id DESC LIMIT 1")
[ -n "$TOP" ] && { PASS=$((PASS+1)); echo "  topup $TOP"; } || { FAIL=$((FAIL+1)); echo "  FAIL topup: ${r:0:120}"; }
expect_num "Dr PettyCash 2000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceId\"='$TOP' AND jl.\"accountId\"='$PCASH_ACCT' AND je.status='POSTED'" 2000
expect_num "float balance = 7000" "SELECT \"floatAmount\" FROM \"PettyCashFloat\" WHERE id='$FL'" 7000

echo "════════ 3. spend ₹1500 → expense + petty credit ════════"
r=$(req POST "petty-cash/$FL/spend" "{\"amount\":1500,\"category\":\"Tea & Snacks\",\"projectId\":\"$PROJ\"}")
EX=$(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('expense',{}).get('id') or d.get('expenseId') or d.get('id',''))" 2>/dev/null)
[ -n "$EX" ] && { PASS=$((PASS+1)); echo "  expense $EX"; } || { FAIL=$((FAIL+1)); echo "  FAIL spend: ${r:0:130}"; }
expect_num "Dr OPEX 1500" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceId\"='$EX' AND a.code='6000' AND je.status='POSTED'" 1500
expect_num "Cr PettyCash 1500" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceId\"='$EX' AND jl.\"accountId\"='$PCASH_ACCT' AND je.status='POSTED'" 1500
expect_num "float balance = 5500" "SELECT \"floatAmount\" FROM \"PettyCashFloat\" WHERE id='$FL'" 5500
expect_cnt "expense auto-approved" "SELECT CASE WHEN status='APPROVED' THEN 1 ELSE 0 END FROM \"Expense\" WHERE id='$EX'" 1
# GL petty cash tied to this float nets to current balance: 5000 + 2000 − 1500
expect_num "net petty GL for float = 5500" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE jl.\"accountId\"='$PCASH_ACCT' AND je.status='POSTED' AND (jl.\"entityId\"='$FL' OR je.\"sourceId\" IN ('$FL','$TOP','$EX'))" 5500

echo "════════════════════════════════════════"
echo "petty-cash chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
