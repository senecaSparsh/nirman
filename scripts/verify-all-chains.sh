#!/usr/bin/env bash
# Run every end-to-end chain verifier against the dev server + database.
# Each script hits the REAL HTTP APIs (cookie auth) and asserts at the
# movement + journal + status level via psql. Together they cover:
#   procurement → GRN → invoice → payment(+TDS/void) → return(PO-vs-MAC)
#   material issue → WIP → unit cost → capitalization(1800)
#   stock: valuation, counts(+stale guard), transfers(+gate pass, shortage GL)
#   sales: material sale → return(proportional) → cancel guard
#   scrap generation → sale(cost recovery) → cancel
#   direct purchase → AP → cancel
#   HR payroll → GL → project labour → payment → advance recovery
#   RA bills → advance recovery → 194C TDS → payment
#   land/asset sale lifecycle
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-all-chains.sh [name ...]
#   no args   → run all chains
#   args      → run only the named chains (e.g. verify-all-chains.sh issue scrap)
# MUTATES the dev DB — each script creates synthetic rows for its scenario.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
DIR="$(cd "$(dirname "$0")" && pwd)"

CHAIN_LIST="procurement:verify-procurement-chain.sh
issue:verify-issue-chain.sh
stock:verify-stock-chain.sh
stockcount:verify-stock-count-chain.sh
transfer:verify-transfer-chain.sh
direct:verify-direct-purchase-chain.sh
supplierreturn:verify-supplier-return-chain.sh
payment:verify-supplier-payment-tds.sh
sales:verify-sales-chain.sh
salereturn:verify-material-sale-return-chain.sh
scrap:verify-scrap-chain.sh
wip:verify-wip-capitalization.sh
gst:verify-gst-reports-chain.sh
ra:verify-ra-bill-chain.sh
landbuy:verify-land-purchase-chain.sh
claim:verify-expense-claim-chain.sh
pettycash:verify-petty-cash-chain.sh
asset:verify-asset-sale-chain.sh
hr:verify-hr-chain.sh
payrollgl:verify-payroll-gl-chain.sh"

chain_script() {
  echo "$CHAIN_LIST" | while IFS=: read -r n s; do [ "$n" = "$1" ] && echo "$s" && return; done
}

# Auth check up front — every script needs a valid session.
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR" "$BASE/api/companies")
if [ "$code" != "200" ]; then
  echo "API auth check failed (HTTP $code) — refresh the cookie jar first." >&2
  exit 2
fi

if [ $# -gt 0 ]; then
  WANT="$*"
else
  WANT=$(echo "$CHAIN_LIST" | cut -d: -f1 | tr '\n' ' ')
fi

TOTAL_P=0; TOTAL_F=0; FAILED_CHAINS=""
for name in $WANT; do
  script=$(chain_script "$name")
  if [ -z "$script" ] && [ -f "$DIR/$name" ]; then script="$name"; fi
  if [ -z "$script" ]; then echo "── $name: unknown chain, skipping"; continue; fi
  echo
  echo "────────────────────────────────────────"
  echo "▶ $name ($script)"
  echo "────────────────────────────────────────"
  out=$(BASE="$BASE" bash "$DIR/$script" 2>&1)
  rc=$?
  echo "$out"
  # Exit 2 = deliberate skip (e.g. payroll chains when every month ≤ today
  # already carries a PayrollPeriod — the lock is working correctly).
  if [ $rc -eq 2 ] || echo "$out" | grep -qE "^SKIP"; then
    echo "  ── skipped"
    continue
  fi
  line=$(echo "$out" | grep -oE "[0-9]+ passed, [0-9]+ failed" | tail -1)
  if [ -z "$line" ]; then
    echo "  ⚠ no summary line — script may have died mid-run"
    FAILED_CHAINS="$FAILED_CHAINS $name(no-summary)"
    continue
  fi
  p=${line%% passed*}; f=$(echo "$line" | sed 's/.*passed, //;s/ failed//')
  TOTAL_P=$((TOTAL_P + p)); TOTAL_F=$((TOTAL_F + f))
  [ "$f" != "0" ] && FAILED_CHAINS="$FAILED_CHAINS $name"
done

echo
echo "════════════════════════════════════════"
echo "ALL CHAINS: $TOTAL_P passed, $TOTAL_F failed"
[ -n "$FAILED_CHAINS" ] && echo "failing chains:$FAILED_CHAINS"
[ "$TOTAL_F" -eq 0 ] && [ -z "$FAILED_CHAINS" ]
