#!/usr/bin/env bash
# Supplier payment → TDS → void verification:
#   pay 5000 with TDS 500 → Dr AP(2000) 5000 / Cr Cash(1000) 4500 /
#     Cr TDS Payable(2400) 500 — AP settles GROSS, cash nets the deduction
#   guards: unlinked payment > balanceOwed refused; TDS > amount refused
#   void → status VOID, balanceOwed restored by the gross amount,
#     SUPPLIER_PAYMENT_REVERSAL posts the mirror legs (net GL = 0)
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-supplier-payment-tds.sh
# MUTATES the dev DB.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                        # SRG REALCON
SUP="vfysp$(date +%s)"                               # fresh fixture supplier — deterministic payable

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { got=$(P "$2"); ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03"); [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_cnt() { got=$(P "$2"); [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }; }
expect_refused() { case "$2" in *'"ok":true'*|*'"id"'*) FAIL=$((FAIL+1)); echo "  FAIL $1: unexpectedly succeeded: ${2:0:110}";; *) PASS=$((PASS+1)); echo "  PASS $1 → refused (${2:0:70})";; esac; }

# Provision a fresh supplier + a real API-posted invoice so the payable is
# deterministic (seeded balances were rebuilt from GL and no longer cover the
# amounts this chain moves).
P "INSERT INTO \"Supplier\" (id,\"companyId\",name,\"updatedAt\",\"createdAt\") VALUES ('$SUP','$C','wf supplier tds',now(),now())"
# Service invoice (no material lines) — material lines require a linked PO for
# three-way matching. Posted via the API so balanceOwed + AP GL move together.
INVRES=$(req POST "supplier-invoices" "{\"invoiceNumber\":\"INV-TDS-$RANDOM\",\"supplierId\":\"$SUP\",\"invoiceDate\":\"2025-10-01\",\"subtotal\":10000,\"gstAmount\":1800,\"totalAmount\":11800}")
echo "  invoice: ${INVRES:0:120}"
# balanceOwed + AP GL move at invoice APPROVE, not create — approve it first.
INVID=$(echo "$INVRES" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
req PATCH "supplier-invoices/$INVID" '{"action":"approve"}' >/dev/null

BAL0=$(P "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'")
echo "  baseline: balanceOwed=$BAL0"

echo "════════ 1. guards first ════════"
r=$(req POST "supplier-payments" "{\"supplierId\":\"$SUP\",\"amount\":4000,\"tdsAmount\":5000,\"paymentMode\":\"BANK\"}")
expect_refused "TDS > amount" "$r"
OVER=$(psql -h localhost -d nirman_inventory -tAc "SELECT $BAL0::numeric + 1")
r=$(req POST "supplier-payments" "{\"supplierId\":\"$SUP\",\"amount\":$OVER,\"paymentMode\":\"BANK\"}")
expect_refused "unlinked payment > balanceOwed" "$r"

echo "════════ 2. pay 5000 with TDS 500 ════════"
r=$(req POST "supplier-payments" "{\"supplierId\":\"$SUP\",\"amount\":5000,\"tdsAmount\":500,\"tdsSection\":\"194C\",\"paymentMode\":\"BANK\"}")
PAY=$(echo "$r" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
[ -n "$PAY" ] && { PASS=$((PASS+1)); echo "  payment $PAY"; } || { FAIL=$((FAIL+1)); echo "  FAIL pay: ${r:0:140}"; }
expect_num "Dr AP 5000 (gross)" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_PAYMENT' AND je.\"sourceId\"='$PAY' AND a.code='2000'" 5000
expect_num "Cr Cash 4500 (net)" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_PAYMENT' AND je.\"sourceId\"='$PAY' AND a.code='1000'" 4500
expect_num "Cr TDS 500" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='SUPPLIER_PAYMENT' AND je.\"sourceId\"='$PAY' AND a.code='2400'" 500
expect_num "balanceOwed −5000" "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'" "$(psql -h localhost -d nirman_inventory -tAc "SELECT $BAL0::numeric - 5000")"
expect_num "entry balanced" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceType\"='SUPPLIER_PAYMENT' AND je.\"sourceId\"='$PAY'" 0

echo "════════ 3. void → gross restore + reversal ════════"
r=$(req POST "supplier-payments/$PAY/void" '{"reason":"verifier"}')
echo "$r" | grep -q '"ok":true\|VOID' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  void → ${r:0:90}"
expect_cnt "status VOID" "SELECT CASE WHEN status='VOID' THEN 1 ELSE 0 END FROM \"SupplierPayment\" WHERE id='$PAY'" 1
expect_num "balanceOwed restored" "SELECT \"balanceOwed\" FROM \"Supplier\" WHERE id='$SUP'" "$BAL0"
expect_cnt "reversal JE posted" "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='SUPPLIER_PAYMENT_REVERSAL' AND \"sourceId\"='$PAY' AND status='POSTED'" 1
# net effect of payment + reversal on all three accounts = 0
expect_num "AP net 0" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceId\"='$PAY' AND a.code='2000' AND je.status='POSTED'" 0
expect_num "TDS net 0" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceId\"='$PAY' AND a.code='2400' AND je.status='POSTED'" 0
r=$(req POST "supplier-payments/$PAY/void" '{}')
expect_refused "double void" "$r"

echo "════════════════════════════════════════"
echo "supplier-payment chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
