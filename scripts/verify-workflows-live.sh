#!/usr/bin/env bash
# Live workflow verification — drives each core state machine through its
# transitions against a RUNNING server and asserts status flips + audit rows
# + side-effect records in Postgres.
#
# Usage:
#   BASE=http://localhost:3001 ./scripts/verify-workflows-live.sh
#
# Requires: an authenticated session cookie jar (cookies.txt via demo-login),
# and psql access to DATABASE_URL's database. Mutates seeded dev data —
# run against dev/staging only, NEVER production.

set -u
BASE="${BASE:-http://localhost:3000}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
DB="${DATABASE_URL:-postgresql://localhost:5432/nirman_inventory}"
PASS=0; FAIL=0; SKIP=0

q() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
patch() { curl -s -b "$COOKIE_JAR" -H "Content-Type: application/json" --max-time 40 -X PATCH "$BASE/api/$1" -d "$2"; }
expect_status() { # name table id want
  got=$(q "SELECT status::text FROM \"$2\" WHERE id='$3'")
  if [ "$got" = "$4" ]; then PASS=$((PASS+1)); echo "  PASS $1 → $got";
  else FAIL=$((FAIL+1)); echo "  FAIL $1: wanted $4, got ${got:-<none>}"; fi
}
expect_audit() { # name entityId action-substr
  n=$(q "SELECT count(*) FROM \"AuditLog\" WHERE \"entityId\"='$2' AND action ILIKE '%$3%'")
  if [ "$n" -gt 0 ]; then PASS=$((PASS+1)); echo "  PASS audit $1 ($n rows)";
  else FAIL=$((FAIL+1)); echo "  FAIL audit $1: no $3 row"; fi
}

echo "== gate pass: PENDING → approve → confirmExit =="
GP=$(q "SELECT id FROM \"GatePass\" WHERE status IN ('PENDING','DRAFT','SUBMITTED') LIMIT 1")
if [ -z "$GP" ]; then SKIP=$((SKIP+1)); echo "  SKIP no pending gate pass";
else
  patch "gate-passes/$GP" '{"action":"approve"}' >/dev/null
  expect_status "gp approve" GatePass "$GP" APPROVED
  patch "gate-passes/$GP" '{"action":"confirmExit","exitNotes":"live-verify"}' >/dev/null
  expect_status "gp exit" GatePass "$GP" EXITED
  expect_audit "gp" "$GP" "GATE_PASS_"
fi

echo "== purchase order: APPROVED → order =="
PO=$(q "SELECT id FROM \"PurchaseOrder\" WHERE status='APPROVED' LIMIT 1")
if [ -z "$PO" ]; then SKIP=$((SKIP+1)); echo "  SKIP no approved PO";
else
  patch "purchase-orders/$PO" '{"action":"order"}' >/dev/null
  expect_status "po order" PurchaseOrder "$PO" ORDERED
  expect_audit "po" "$PO" "PURCHASE_ORDER_ORDER"
fi

echo "== stock transfer: IN_TRANSIT → complete =="
TR=$(q "SELECT id FROM \"StockTransfer\" WHERE status='IN_TRANSIT' LIMIT 1")
if [ -z "$TR" ]; then SKIP=$((SKIP+1)); echo "  SKIP no in-transit transfer";
else
  patch "transfers/$TR" '{"action":"complete"}' >/dev/null
  expect_status "transfer complete" StockTransfer "$TR" COMPLETED
  n=$(q "SELECT count(*) FROM \"StockMovement\" WHERE \"refId\"='$TR' AND \"movementType\"='TRANSFER_IN'")
  [ "$n" -gt 0 ] && { PASS=$((PASS+1)); echo "  PASS transfer-in movement"; } || { FAIL=$((FAIL+1)); echo "  FAIL no TRANSFER_IN movement"; }
fi

echo "== expense claim: APPROVED → pay =="
CL=$(q "SELECT id FROM \"ExpenseClaim\" WHERE status='APPROVED' LIMIT 1")
if [ -z "$CL" ]; then SKIP=$((SKIP+1)); echo "  SKIP no approved claim";
else
  patch "expense-claims/$CL" '{"action":"pay","paymentMode":"CASH"}' >/dev/null
  expect_status "claim pay" ExpenseClaim "$CL" PAID
fi

echo "== negative: re-approve terminal gate pass =="
GP_DONE=$(q "SELECT id FROM \"GatePass\" WHERE status='EXITED' LIMIT 1")
if [ -n "$GP_DONE" ]; then
  code=$(patch "gate-passes/$GP_DONE" '{"action":"approve"}')
  echo "$code" | grep -q "Cannot approve\|error" && { PASS=$((PASS+1)); echo "  PASS terminal-state guard"; } || { FAIL=$((FAIL+1)); echo "  FAIL re-approved EXITED pass: $code"; }
fi

echo "== negative: invalid action / malformed body =="
r=$(patch "gate-passes/${GP_DONE:-x}" '{"action":"explode"}'); echo "$r" | grep -q "error" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  FAIL bogus action accepted"; }
r=$(patch "gate-passes/${GP_DONE:-x}" '"string"'); echo "$r" | grep -q "error" && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  FAIL string body accepted"; }

echo
echo "RESULT: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
