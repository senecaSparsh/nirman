#!/usr/bin/env bash
# Payroll → GL chain verification — exercises the REAL journal postings
# end-to-end at the account level, not just the line math:
#   salary components (PF/PT) → generate → PAYROLL journal legs
#   → ProjectCost LABOUR day-share split → pay → PAYROLL_PAYMENT journal
#   → ADVANCE_RECOVERY journal → Salaries Payable net-zero for the period.
#
# Rolls forward to the first month with no PayrollPeriod (a PAID period
# locks the month, so a hardcoded month runs only once). Creates one
# synthetic FIXED employee + a synthetic second project so gross can be
# day-share split 3:1 across two projects:
#   EG FIXED ₹26,000/mo: EMPLOYEE_PF ₹1,800 + EMPLOYER_PF ₹1,800 +
#     PROFESSION_TAX ₹200 + advance recovery ₹5,000 → gross 26,000,
#     totalDeductions 7,000, netPay 19,000
#   Expected PAYROLL JE:
#     Dr 6100 Salaries Expense        27,800  (= gross + employer PF)
#     Cr 2200 Salaries Payable        24,000  (= net + other deductions)
#     Cr 2250 PF Payable               3,600  (employee + employer)
#     Cr 2450 Profession Tax Payable     200
#   Expected PAYROLL_PAYMENT JE: Dr 2200 / Cr 1000 = 19,000
#   Expected ADVANCE_RECOVERY JE:  Dr 2200 / Cr 1650 = 5,000
#   Net 2200 movement for the period: 0 — payable fully clears.
#
# Usage: BASE=http://localhost:3000 ./scripts/verify-payroll-gl-chain.sh
# MUTATES the dev DB. Deletes non-test lines from the period before
# processing so real employees don't post journals for a synthetic month.

set -u
BASE="${BASE:-http://localhost:3000}"
JAR="${COOKIE_JAR:-/tmp/nirman-cookies.txt}"
P() { psql -h localhost -d nirman_inventory -tAc "$1" 2>/dev/null | tr -d ' '; }
C="cmtv3x4t50000vlp0b23vdtxe"                      # SRG REALCON
PROJ1="cmtwhwzer000pvlt3cth8e8qo"                  # apex center (real)

PASS=0; FAIL=0
req() { curl -s -b "$JAR" -H "Content-Type: application/json" --max-time 60 -X "$1" "$BASE/api/$2" -d "$3"; }
expect_num() { # label sql want — numeric compare within ₹0.02
  got=$(P "$2")
  ok=$(psql -h localhost -d nirman_inventory -tAc "SELECT abs(coalesce(${got:-NULL}::numeric,-999999) - $3::numeric) < 0.03")
  [ "$ok" = "t" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
expect_cnt() { # label sql want — exact integer count
  got=$(P "$2")
  [ "$got" = "$3" ] && { PASS=$((PASS+1)); echo "  PASS $1 → $got"; } || { FAIL=$((FAIL+1)); echo "  FAIL $1: want $3 got ${got:-<none>}"; }
}
uid() { echo "glc$(date +%s)$RANDOM"; }

# Roll forward to the first month with NO PayrollPeriod — a PAID period
# locks attendance + payroll writes, so a hardcoded month runs only once.
MO=$(P "SELECT to_char(m,'YYYY-MM') FROM generate_series('2025-10-01'::date,'2030-12-01'::date,'1 month') m WHERE NOT EXISTS (SELECT 1 FROM \"PayrollPeriod\" pp WHERE pp.\"companyId\"='$C' AND date_trunc('month',pp.\"startDate\")=date_trunc('month',m)) ORDER BY m LIMIT 1")
MON=$((10#${MO#*-})); YR=${MO%%-*}
EG="glce$(date +%s)"
PROJ2="glcp$(date +%s)"                            # synthetic second project
ADV="$(uid)"

echo "════════ setup: project + employee + components + advance + attendance ════════"
echo "  payroll month: $MO"
P "INSERT INTO \"Project\" (id,name,\"companyId\",\"updatedAt\") VALUES ('$PROJ2','glc-site-two','$C',now())"
P "INSERT INTO \"Employee\" (id,name,\"companyId\",\"wageType\",\"monthlySalary\",\"joinDate\",active,\"activeProjectId\",\"updatedAt\") VALUES ('$EG','glc-fixed','$C','FIXED',26000,'$MO-01',true,'$PROJ1',now())"
P "INSERT INTO \"SalaryComponent\" (id,\"employeeId\",type,amount,\"isDeduction\",\"updatedAt\") VALUES
    ('$(uid)','$EG','EMPLOYEE_PF',1800,true,now()),
    ('$(uid)','$EG','EMPLOYER_PF',1800,false,now()),
    ('$(uid)','$EG','PROFESSION_TAX',200,true,now())"
P "INSERT INTO \"EmployeeAdvance\" (id,\"companyId\",\"employeeId\",amount,\"monthlyRecovery\",status,\"issueDate\",\"updatedAt\",\"createdAt\") VALUES ('$ADV','$C','$EG',20000,5000,'ACTIVE','2025-08-01',now(),now())"
# 4 PRESENT days: 3 on PROJ1, 1 on PROJ2 → gross splits 3:1
for d in 02 03 04; do
  req POST "attendance" "{\"date\":\"$MO-$d\",\"projectId\":\"$PROJ1\",\"records\":[{\"employeeId\":\"$EG\",\"status\":\"PRESENT\"}]}" >/dev/null
done
req POST "attendance" "{\"date\":\"$MO-05\",\"projectId\":\"$PROJ2\",\"records\":[{\"employeeId\":\"$EG\",\"status\":\"PRESENT\"}]}" >/dev/null
n=$(P "SELECT count(*) FROM \"WorkerAttendance\" WHERE \"employeeId\"='$EG'")
expect_cnt "attendance seeded (4 rows)" "SELECT count(*) FROM \"WorkerAttendance\" WHERE \"employeeId\"='$EG'" 4

echo "════════ 2. generate + line math ════════"
r=$(req POST "payroll" "{\"month\":$MON,\"year\":$YR}")
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  gen → ${r:0:120}"
PP=$(P "SELECT id FROM \"PayrollPeriod\" WHERE \"companyId\"='$C' AND \"startDate\"='$MO-01'")
L=$(P "SELECT id FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\"='$EG'")
expect_num "grossPay 26000" "SELECT \"grossPay\" FROM \"PayrollLine\" WHERE id='$L'" 26000
expect_num "pf 1800" "SELECT pf FROM \"PayrollLine\" WHERE id='$L'" 1800
expect_num "employerPf 1800" "SELECT \"employerPf\" FROM \"PayrollLine\" WHERE id='$L'" 1800
expect_num "professionTax 200" "SELECT \"professionTax\" FROM \"PayrollLine\" WHERE id='$L'" 200
expect_num "advance deduction 5000" "SELECT amount FROM \"PayrollLineComponent\" WHERE \"payrollLineId\"='$L' AND \"advanceId\"='$ADV'" 5000
expect_num "netPay 19000" "SELECT \"netPay\" FROM \"PayrollLine\" WHERE id='$L'" 19000

echo "════════ 3. keep only the test line, process, PAYROLL journal ════════"
# Non-test employees synthesize lines too — drop them so no real journals post.
P "DELETE FROM \"PayrollLine\" WHERE \"payrollPeriodId\"='$PP' AND \"employeeId\"<>'$EG'"
r=$(req PATCH "payroll/$PP" '{"action":"process"}')
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  process → ${r:0:120}"
JE=$(P "SELECT id FROM \"JournalEntry\" WHERE \"sourceType\"='PAYROLL' AND \"sourceId\"='$PP'")
[ -n "$JE" ] && PASS=$((PASS+1)) || { FAIL=$((FAIL+1)); echo "  FAIL no PAYROLL journal"; }
expect_num "PAYROLL Dr 6100 = 27800" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='PAYROLL' AND je.\"sourceId\"='$PP' AND a.code='6100'" 27800
expect_num "PAYROLL Cr 2200 = 24000 (net + deductions)" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='PAYROLL' AND je.\"sourceId\"='$PP' AND a.code='2200'" 24000
expect_num "PAYROLL Cr 2250 = 3600 (EE+ER PF)" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='PAYROLL' AND je.\"sourceId\"='$PP' AND a.code='2250'" 3600
expect_num "PAYROLL Cr 2450 = 200 (PT)" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='PAYROLL' AND je.\"sourceId\"='$PP' AND a.code='2450'" 200
expect_num "PAYROLL entry balanced" "SELECT abs(SUM(jl.debit)-SUM(jl.credit)) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" WHERE je.\"sourceType\"='PAYROLL' AND je.\"sourceId\"='$PP'" 0

echo "════════ 4. ProjectCost LABOUR day-share ════════"
expect_num "PROJ1 labour = 19500 (3/4 of gross)" "SELECT COALESCE(SUM(amount),0) FROM \"ProjectCost\" WHERE \"projectId\"='$PROJ1' AND \"costType\"='LABOUR' AND notes LIKE '%payroll $MON/$YR%'" 19500
expect_num "PROJ2 labour = 6500 (1/4 of gross)" "SELECT COALESCE(SUM(amount),0) FROM \"ProjectCost\" WHERE \"projectId\"='$PROJ2' AND \"costType\"='LABOUR' AND notes LIKE '%payroll $MON/$YR%'" 6500

echo "════════ 5. pay → PAYROLL_PAYMENT + ADVANCE_RECOVERY ════════"
r=$(req PATCH "payroll/$PP" '{"action":"pay"}')
echo "$r" | grep -q '"ok":true' && PASS=$((PASS+1)) || FAIL=$((FAIL+1)); echo "  pay → ${r:0:120}"
expect_num "PAYROLL_PAYMENT Dr 2200 = 19000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='PAYROLL_PAYMENT' AND je.\"sourceId\"='$PP' AND a.code='2200'" 19000
expect_num "PAYROLL_PAYMENT Cr 1000 = 19000" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='PAYROLL_PAYMENT' AND je.\"sourceId\"='$PP' AND a.code='1000'" 19000
expect_num "ADVANCE_RECOVERY Dr 2200 = 5000" "SELECT COALESCE(SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='ADVANCE_RECOVERY' AND je.\"sourceId\"='$L' AND a.code='2200'" 5000
expect_num "ADVANCE_RECOVERY Cr 1650 = 5000" "SELECT COALESCE(SUM(jl.credit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE je.\"sourceType\"='ADVANCE_RECOVERY' AND je.\"sourceId\"='$L' AND a.code='1650'" 5000
expect_num "advance recoveredAmount +5000" "SELECT \"recoveredAmount\" FROM \"EmployeeAdvance\" WHERE id='$ADV'" 5000

echo "════════ 6. payable fully clears for the period ════════"
expect_num "net 2200 for period = 0" "SELECT COALESCE(SUM(jl.credit)-SUM(jl.debit),0) FROM \"JournalLine\" jl JOIN \"JournalEntry\" je ON je.id=jl.\"journalEntryId\" JOIN \"GlAccount\" a ON a.id=jl.\"accountId\" WHERE a.code='2200' AND je.\"sourceType\" IN ('PAYROLL','PAYROLL_PAYMENT','ADVANCE_RECOVERY') AND (je.\"sourceId\"='$PP' OR je.\"sourceId\"='$L')" 0

echo "════════════════════════════════════════"
echo "payroll-gl chain: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
