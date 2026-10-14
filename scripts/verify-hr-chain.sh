#!/usr/bin/env bash
# HR payroll-chain verification — exercises the REAL arithmetic end-to-end:
#   attendance mix → generate → per-line math → advance recovery → regenerate
#   idempotency → process → pay → advance balance credit → payroll lock.
#
# Rolls forward to the first month with no PayrollPeriod (PAID periods
# lock the month, so a hardcoded month runs only once; the roll is capped
# at the current month because attendance refuses future dates). Creates
# three synthetic employees:
#   E1 DAILY ₹500/day: 10 PRESENT + 1 OVERTIME(11h) + 2 HALF_DAY + 4 LATE + 2 ABSENT
#     → daysWorked 16, late-deduction −0.5d, OT 3h × ₹62.5 × 1.5 = ₹281.25
#     → advance recovery ₹5,000 (of ₹20,000 outstanding)
#   E2 DAILY ₹500/day: 1 PRESENT + advance recovery ₹5,000/mo
#     → capped at gross → netPay ₹0 (deductions can't exceed gross)
#   E3 DAILY ₹500/day: 3 PRESENT then deactivated before generate
#     → terminated-but-worked still gets a line (final-settlement rule)
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-hr-chain.sh
# MUTATES the dev DB. Cleans up its lines for non-test employees before pay
# so real-employee journals aren't posted for a synthetic period.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
PROJ="cmtwhwzer000pvlt3cth8e8qo"                   # apex center

PASS=0; FAIL=0; SKIP=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect() { # label table id column want
  got=$(P "SELECT $4::text FROM \"$2\" WHERE id='$3'")
  [ "$got" = "$5" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $5 got ${got:-<none>}"; }
}
expect_num() { # label sql want — numeric compare within ₹0.01
  got=$(P "$2")
  ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.02")
  [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
uid() { echo "hrc$(date +%s)$RANDOM"; }

# Roll forward to the first free month (no PayrollPeriod), capped at the
# current month — attendance refuses present-type marks on future dates,
# and a PAID period locks the month entirely.
MO=$(P "SELECT to_char(m,'YYYY-MM') FROM generate_series('2025-10-01'::date,'2030-12-01'::date,'1 month') m WHERE m <= date_trunc('month',now()) AND NOT EXISTS (SELECT 1 FROM \"PayrollPeriod\" pp WHERE pp.\"companyId\"='$C' AND date_trunc('month',pp.\"startDate\")=date_trunc('month',m)) ORDER BY m LIMIT 1")
if [ -z "$MO" ]; then echo "no free payroll month ≤ current — all are PAID-locked"; exit 2; fi
MON=$((10#${MO#*-})); YR=${MO%%-*}
echo "════════ setup: employees + advance (payroll month $MO) ════════"
E1=$(uid); E2=$(uid); E3=$(uid); ADV=$(uid)
for E in $E1 $E2 $E3; do
  P "INSERT INTO \"Employee\" (id,name,\"companyId\",\"wageType\",\"dailyRate\",\"joinDate\",active,\"updatedAt\") VALUES ('$E','hrchain-$E','$C','DAILY',500,'$MO-01',true,now())"
done
P "INSERT INTO \"EmployeeAdvance\" (id,\"companyId\",\"employeeId\",amount,\"monthlyRecovery\",status,\"issueDate\",\"updatedAt\",\"createdAt\") VALUES ('$ADV','$C','$E1',20000,5000,'ACTIVE','2025-07-01',now(),now())"
P "INSERT INTO \"EmployeeAdvance\" (id,\"companyId\",\"employeeId\",amount,\"monthlyRecovery\",status,\"issueDate\",\"updatedAt\",\"createdAt\") VALUES ('$(uid)','$C','$E2',20000,5000,'ACTIVE','2025-07-01',now(),now())"

echo "════════ 1. attendance mix via POST /api/attendance (one call per date) ════════"
# The bulk API is single-date — one POST per day carries that day's records.
post_day() { # date json-records
  local r i
  for i in 1 2 3 4; do
    r=$(req POST "attendance" "{\"date\":\"$1\",\"projectId\":\"$PROJ\",\"records\":[$2]}")
    echo "$r" | grep -qi "conflict" || break
    sleep 2
  done
  echo "$r" | grep -q '"ok":true' || { FAIL=$((FAIL+1)); echo "  FAIL attendance $1: ${r:0:140}"; }
}
rec() { echo "{\"employeeId\":\"$1\",\"status\":\"$2\"${3:+,\"hoursWorked\":$3}}"; }

# E1: 10 PRESENT(8h) + 1 OVERTIME(11h) + 2 HALF_DAY + 4 LATE + 2 ABSENT
for d in 04 05 06 07 08 11 12 13 14 18; do post_day "$MO-$d" "$(rec $E1 PRESENT 8)"; done
post_day "$MO-15" "$(rec $E1 OVERTIME 11)"
for d in 19 20; do post_day "$MO-$d" "$(rec $E1 HALF_DAY 4)"; done
for d in 21 22 25 26; do post_day "$MO-$d" "$(rec $E1 LATE 8)"; done
for d in 27 28; do post_day "$MO-$d" "$(rec $E1 ABSENT)"; done
# E2: 1 PRESENT — gross ₹500 vs ₹5000/mo recovery → net-floor cap path
post_day "$MO-04" "$(rec $E2 PRESENT 8)"
# E3: 3 PRESENT — deactivated before generate → final-settlement inclusion
for d in 04 05 06; do post_day "$MO-$d" "$(rec $E3 PRESENT 8)"; done

n=$(P "SELECT count(*) FROM \"WorkerAttendance\" WHERE \"employeeId\" IN ('$E1','$E2','$E3') AND date >= '$MO-01' AND date < ('$MO-01'::date + interval '1 month')")
[ "${n:-0}" -ge 22 ] && { PASS=$((PASS+1)); echo "  PASS attendance rows ($n)"; } || { FAIL=$((FAIL+1)); echo "  FAIL attendance rows ($n)"; }

echo "════════ 2. E3 terminated mid-month — still owed worked days ════════"
P "UPDATE \"Employee\" SET active=false WHERE id='$E3'"

echo "════════ 3. generate → line math ════════"
r=$(req POST "payroll" "{\"month\":$MON,\"year\":$YR}")
PP=$(P "SELECT id FROM \"PayrollPeriod\" WHERE \"companyId\"='$C' AND year=$YR AND month=$MON")
[ -n "$PP" ] && { PASS=$((PASS+1)); echo "  PASS period created $PP"; } || { FAIL=$((FAIL+1)); echo "  FAIL period: ${r:0:160}"; }
L1=$(P "SELECT id FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\"='$E1'")
L2=$(P "SELECT id FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\"='$E2'")
L3=$(P "SELECT id FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\"='$E3'")
[ -n "$L3" ] && { PASS=$((PASS+1)); echo "  PASS terminated-with-attendance got a line"; } || { FAIL=$((FAIL+1)); echo "  FAIL E3 dropped from payroll"; }

# E1 arithmetic: days 10+1+1+4 = 16, 4 lates → −0.5d; basic = 500×16 − 250 = 7750
expect_num "e1 daysWorked" "SELECT \"daysWorked\" FROM \"PayrollLine\" WHERE id='$L1'" 15.5
expect_num "e1 basic (16d − 0.5d late)" "SELECT \"basicAmount\" FROM \"PayrollLine\" WHERE id='$L1'" 7750
expect_num "e1 overtime (3h × 62.5 × 1.5)" "SELECT \"overtimeAmount\" FROM \"PayrollLine\" WHERE id='$L1'" 281.25
expect_num "e1 net (7750 + 281.25 − 5000 adv)" "SELECT \"netPay\" FROM \"PayrollLine\" WHERE id='$L1'" 3031.25
# advance recovery component row links the advance and carries the deduction
expect_num "e1 advance row" "SELECT amount FROM \"PayrollLineComponent\" WHERE \"payrollLineId\"='$L1' AND \"advanceId\"='$ADV'" 5000

# E2 net-floor: gross 500 < recovery 5000 → capped, net ≥ 0
expect_num "e2 capped deduction" "SELECT amount FROM \"PayrollLineComponent\" WHERE \"payrollLineId\"='$L2' AND \"advanceId\" IS NOT NULL" 500
expect_num "e2 net floor" "SELECT \"netPay\" FROM \"PayrollLine\" WHERE id='$L2'" 0

# E3: 3 days × ₹500
expect_num "e3 basic" "SELECT \"basicAmount\" FROM \"PayrollLine\" WHERE id='$L3'" 1500

echo "════════ 4. regenerate idempotent (wipes + recomputes, no dupes) ════════"
r=$(req POST "payroll" "{\"month\":$MON,\"year\":$YR,\"confirm\":true}")
n=$(P "SELECT count(*) FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\"='$E1'")
[ "$n" = "1" ] && { PASS=$((PASS+1)); echo "  PASS regen no dupes"; } || { FAIL=$((FAIL+1)); echo "  FAIL regen dupes ($n)"; }
# Regen deletes+recreates lines — the pre-regen id is stale, re-fetch.
L1=$(P "SELECT id FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\"='$E1'")
expect_num "e1 net after regen" "SELECT \"netPay\" FROM \"PayrollLine\" WHERE id='$L1'" 3031.25

echo "════════ 5. process → pay → advance credit ════════"
# Keep blast-radius to the three test employees — real employees' synthetic
# lines for this month would post crores of journals on pay.
P "DELETE FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\" NOT IN ('$E1','$E2','$E3')"
r=$(req PATCH "payroll/$PP" '{"action":"process"}')
[ "$(P "SELECT status FROM \"PayrollPeriod\" WHERE id='$PP'")" != "PROCESSED" ] && echo "  · process resp: ${r:0:120}"
expect "period process" PayrollPeriod "$PP" '"status"' PROCESSED
r=$(req PATCH "payroll/$PP" '{"action":"pay"}')
[ "$(P "SELECT status FROM \"PayrollPeriod\" WHERE id='$PP'")" != "PAID" ] && echo "  · pay resp: ${r:0:120}"
expect "period pay" PayrollPeriod "$PP" '"status"' PAID
expect_num "advance recovered" "SELECT \"recoveredAmount\" FROM \"EmployeeAdvance\" WHERE id='$ADV'" 5000
expect "advance still ACTIVE (15k left)" EmployeeAdvance "$ADV" '"status"' ACTIVE

echo "════════ 6. payroll lock — attendance write into PAID period ════════"
r=$(req POST "attendance" "{\"date\":\"$MO-27\",\"projectId\":\"$PROJ\",\"records\":[{\"employeeId\":\"$E1\",\"status\":\"PRESENT\",\"hoursWorked\":8}]}")
echo "$r" | grep -qiE "lock|paid|processed|error" && { PASS=$((PASS+1)); echo "  PASS paid-period write blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL paid period accepted write: ${r:0:160}"; }

echo "════════ 7. generate on locked period → 409 ════════"
r=$(req POST "payroll" "{\"month\":$MON,\"year\":$YR,\"confirm\":true}")
echo "$r" | grep -qiE "already|409|error" && { PASS=$((PASS+1)); echo "  PASS regen locked blocked"; } || { FAIL=$((FAIL+1)); echo "  FAIL regen accepted: ${r:0:160}"; }

echo; echo "════════ RESULT: $PASS passed, $FAIL failed, $SKIP skipped ════════"
[ "$FAIL" -eq 0 ]
