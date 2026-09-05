# People World Audit (§4) — Gauntlet Verification

> **Source**: `USE_CASES_AND_WORKFLOWS.md` lines 472–521 (§4 People World — HR & Field)
> **Method**: Two-pass gauntlet (read → verify → re-read → verify) against the real codebase.
> **Date**: 2026-09-04

## Bookmark

- Source: `USE_CASES_AND_WORKFLOWS.md` §4 People World (lines 472–521)
- Schema: `packages/db/prisma/schema.prisma` (Employee, Crew, WorkerAttendance, DailyProgressReport, DprLaborLine, DprMaterialLine, PayrollPeriod, PayrollLine, LeaveRequest, StandardConsumption, User, EmployeeBenefit)
- Services: `packages/services/src/hr.ts`, `leave.ts`, `standard-consumption.ts`
- Web: `apps/web/src/app/api/` (hr, attendance, dpr, payroll, leave); `apps/web/src/app/m/site/attendance/`; `apps/web/src/app/reports/payroll-expense/`

---

## Per-Claim Verdicts

### UC-EMP-01: Employee record — name, trade, phone, daily rate, wage type, department, crew/gang.
- Pass 1: `schema.prisma:291-371` Employee has name, trade, phone, dailyRate, wageType, crewId; NO departmentId. `hr.ts:579-640` createEmployee does not accept department. Department exists only on User (schema:413).
- Pass 2: re-read spec L479 "name, trade, phone, daily rate, wage type, department, crew/gang" + re-read Employee model → department not on Employee
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: Employee model/service stores department.
  - Actual: Employee lacks department; department exists only on User. createEmployee/updateEmployee do not accept department.

### UC-EMP-02: H1–H6 hierarchy — User.hierarchyLevel 1–6; any role can be assigned to any level.
- Pass 1: grep "hierarchyLevel" in schema → only one match at `Employee.hierarchyLevel` (schema:315); User model (400-437) has NO hierarchyLevel; no role↔level mapping mechanism
- Pass 2: re-read spec L480 "User.hierarchyLevel 1–6; any role can be assigned to any level" + re-read User model → hierarchy is on Employee, not User; no role-to-level binding
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: User.hierarchyLevel and role-to-level assignment.
  - Actual: hierarchyLevel lives on Employee (schema:315); User has no hierarchyLevel and no role↔level mapping.

### UC-EMP-03: Crews / gangs — Crew groups workers for attendance and DPR.
- Pass 1: `schema.prisma:1233-1252` Crew model; `hr.ts:454-548` createCrew/updateCrew; Employee.crewId relation
- Pass 2: re-read spec L481 + re-read Crew model → crew has name, project, supervisor, members; membership sets crewId on Employee
- **VERDICT: CONFIRMED**

### UC-ATT-01: GPS check-in/out — WorkerAttendance records checkInLat/Lng, checkInLocation, time.
- Pass 1: `schema.prisma:1265-1299` WorkerAttendance has checkInLat, checkInLng, checkOutLat, checkOutLng, checkInLocation, checkOutLocation, checkIn, checkOut; `hr.ts:739-822` recordAttendance persists them
- Pass 2: re-read spec L488 + re-read model + recordAttendance payload → all GPS + timestamp fields stored
- **VERDICT: CONFIRMED**

### UC-ATT-02: 5 attendance codes — P, H, Late, PL, NPL.
- Pass 1: `schema.prisma:1254-1263` AttendanceStatus enum = PRESENT, HALF_DAY, LATE, PAID_LEAVE, NON_PAID_LEAVE, ABSENT, OVERTIME, LEAVE (8 values, full names)
- Pass 2: re-read spec L489 "5 attendance codes" + re-read enum → five listed codes exist but enum has 8 values with full names; UI maps to P/H/PL/NPL labels later
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: Exactly five attendance codes using stated abbreviations.
  - Actual: Enum has 8 values with full-length names; UI maps to abbreviations later.

### UC-ATT-03: Late → half-day rule — 4 lates = 1 half-day cut; <85% = half day, 85–100% = late.
- Pass 1: `hr.ts:124-141` computeStatusFromHours + `:155-160` computeLateHalfDayDeductions + `:1007-1010` generatePayroll applies it
- Pass 2: re-read spec L490 + re-read helpers → <85% → HALF_DAY, ≥85% and <100% → LATE, 4 LATE → 1 half-day deduction in payroll
- **VERDICT: CONFIRMED**

### UC-ATT-04: Paid leave balance — per-employee leave entitlement set at enrollment.
- Pass 1: `schema.prisma:291-371` Employee model + EmployeeBenefit (379-395); NO leave entitlement field. `leave.ts:100-107` ANNUAL_LEAVE_ENTITLEMENT is a global constant by leave type.
- Pass 2: re-read spec L491 "Per-employee leave entitlement set at enrollment" + re-read Employee + leave.ts → no per-employee entitlement; balance check uses company-wide defaults
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: Employee holds a leave entitlement set at enrollment; payroll/leave uses it.
  - Actual: No leave entitlement on Employee; leave.ts uses hard-coded ANNUAL_LEAVE_ENTITLEMENT by leave type.

### UC-ATT-05: Self check-in/out — Mobile /m/site/attendance allows workers to check in/out; supervisors can bulk-mark or override.
- Pass 1: `apps/web/src/app/m/site/attendance/page.tsx:11-40` requires PERM.HR_MANAGE — supervisor bulk form only. Self-check-in exists at `/api/attendance/self-check-in` (1-125), `/api/attendance/self-check-out` (1-87), and MobileSelfCheckIn component on `/m/home`.
- Pass 2: re-read spec path "/m/site/attendance" + re-read mobile attendance page + self-check routes → workers cannot self-check-in on /m/site/attendance; that route is supervisor bulk; self-service lives on /m/home with separate API
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: /m/site/attendance is the worker self check-in/out page; supervisors can also bulk-mark.
  - Actual: /m/site/attendance is supervisor-only bulk marking; self check-in/out is at /m/home via /api/attendance/self-check-in/out.

### UC-DPR-01: Submit DPR — project, work type, labor count, material lines, % complete, ETA.
- Pass 1: `schema.prisma:1363-1414` DailyProgressReport + `hr.ts:1336-1354` SubmitDprInput → project, workType, workQty, workUnit, workSummary, materialLines, laborLines, progressPct, tomorrowPlan; NO "ETA" field; "labor count" is actually labor lines with hoursWorked
- Pass 2: re-read spec L499 "project, work type, labor count, material lines, % complete, ETA" + re-read schema/input → all except ETA present; tomorrowPlan is not ETA; labor is hours-based lines not a count
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: DPR includes an ETA field and a labor count.
  - Actual: No ETA field; labor captured as DprLaborLine with hoursWorked, not a count.

### UC-DPR-02: Auto-pull attendance times — DPR uses that day's check-in/check-out.
- Pass 1: `hr.ts:1439-1461` submitDPR auto-populates labor lines from that day's WorkerAttendance records for same project, using a.checkIn and a.checkOut
- Pass 2: re-read spec L500 + re-read submitDPR auto-populate block → labor lines created from attendance of same date/project, embedding check-in/out times
- **VERDICT: CONFIRMED**

### UC-DPR-03: Multi-tier approval — SUBMITTED → SUB_ADMIN_APPROVED → APPROVED | REJECTED.
- Pass 1: `schema.prisma:1416-1421` DprApprovalStatus enum + `hr.ts:1553-1589` subAdminApproveDpr, `:1591-1627` adminApproveDpr, `:1629-1666` rejectDpr
- Pass 2: re-read spec L501 + re-read enum + approval functions → exact two-step flow with SUBMITTED → SUB_ADMIN_APPROVED → APPROVED and REJECTED from any pre-final stage
- **VERDICT: CONFIRMED**

### UC-DPR-04: Attendance traffic light — Yellow until DPR approved; then green. Red = absent/no field approval.
- Pass 1: `hr.ts:179-206` computeAttendanceTier + `:244-330` getAttendanceWithTiers implement RED/YELLOW/GREEN tied to GPS + DPR approval
- Pass 2: re-read spec L502 + re-read pure function + query → PAID_LEAVE→GREEN, absent/unpaid→RED, present/late/etc with GPS + DPR approved→GREEN, otherwise YELLOW
- **VERDICT: CONFIRMED**

### UC-DPR-05: Variance analysis — runDprVarianceAnalysis() compares material consumption vs StandardConsumption; over-consumption flagged or auto-generates scrap.
- Pass 1: `standard-consumption.ts:330-520` runDprVarianceAnalysis + `:246-302` calculateConsumptionVariance; `hr.ts:1477-1483` submitDPR calls it
- Pass 2: re-read spec L503 + re-read variance function → compares DPR materialLines against StandardConsumption benchmarks scaled by workQty; stores variance; auto-generates scrap if options.autoGenerateScrap set
- **VERDICT: CONFIRMED**

### UC-DPR-06: DPR-Finance reconciliation — compare DPR-recorded costs against GL-posted costs.
- Pass 1: `hr.ts:1920-1983` dprFinanceReconciliation + `:1990-2024` markDprCostPosted + `:2043-2129` generateMaterialIssueFromDPR
- Pass 2: re-read spec L504 + re-read reconciliation → DPR material cost + labor cost compared against posted MaterialIssue and ProjectCost totals; costPostedDate/Amount tracked
- **VERDICT: CONFIRMED**

### UC-PAYROLL-01: Generate payroll — PayrollPeriod + PayrollLine from attendance; DRAFT → APPROVED → PAID.
- Pass 1: `schema.prisma:1301-1305` PayrollStatus enum = DRAFT/PROCESSED/PAID; `hr.ts:927-1070` generatePayroll
- Pass 2: re-read spec L511 "DRAFT → APPROVED → PAID" + re-read enum → transition is DRAFT → PROCESSED → PAID; approval-equivalent is "process" (processPayroll)
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: Payroll status includes an APPROVED state.
  - Actual: PayrollStatus is DRAFT/PROCESSED/PAID; approval-equivalent action is "process" (processPayroll).

### UC-PAYROLL-02: Auto salary calculation — days present × daily rate − half-day cuts − NPL − late deductions + paid leave + PF + insurance.
- Pass 1: `hr.ts:1001-1049` generatePayroll + `:68-81` attendanceWeight + `:383-401` computeBasicAmount → days present/PL/P/LATE count as 1, HALF_DAY 0.5, NPL 0; late half-day deduction applied. BUT PF, ESI, insurance default to 0 and are NOT auto-calculated from EmployeeBenefit; no EmployeeAdvance/Loan model; NPL simply earns 0 days.
- Pass 2: re-read spec L512 formula + re-read generatePayroll → PF/ESI/insurance fields are 0 on generation (editable manually); no per-employee advance/loan deduction; NPL earns 0 days
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: Auto salary includes PF + insurance and NPL is explicitly deducted.
  - Actual: PF/ESI/insurance fields are 0 on generation (editable manually); no advance/loan model; NPL simply earns 0 days.

### UC-PAYROLL-03: Pay out — record payment mode, bank, cheque photo.
- Pass 1: `schema.prisma:1307-1333` PayrollPeriod + `hr.ts:1284-1317` payPayroll + `api/payroll/[id]/route.ts:81-91` → pay sets status=PAID + posts GL only; NO paymentMode/bank/chequePhoto on PayrollPeriod; employee bank fields exist but not used for payout
- Pass 2: re-read spec L513 + re-read payPayroll + API → pay only marks PAID + posts GL; no payment metadata fields
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: Pay action records payment mode, bank, and cheque photo.
  - Actual: payPayroll only marks period PAID + posts GL; no payment metadata fields on PayrollPeriod.

### UC-PAYROLL-04: Labour cost report — per site, per month.
- Pass 1: `apps/web/src/app/reports/payroll-expense/page.tsx:1-120` shows monthly totals by trade and by crew, NOT by site/project; `projects/[id]/page.tsx` has `labourCostTotal: 0` comment
- Pass 2: re-read spec L514 "Per site, per month" + re-read report → company-level payroll expense report; no per-site per-month labour cost report
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: Labour cost report broken down by project/site and month.
  - Actual: Payroll Expense report is company-wide by month, grouped by trade/crew only.

### UC-LEAVE-01: Apply leave — LeaveRequest with type, dates, reason.
- Pass 1: `schema.prisma:4449-4473` LeaveRequest + `leave.ts:41-85` createLeaveRequest → creates with type, startDate, endDate, computed days, reason
- Pass 2: re-read spec L519 + re-read model/service → confirmed
- **VERDICT: CONFIRMED**

### UC-LEAVE-02: Approve leave — manager approval; APPROVED updates attendance PL, REJECTED keeps NPL if absent.
- Pass 1: `leave.ts:109-226` approveLeaveRequest → APPROVED upserts WorkerAttendance as PAID_LEAVE or NON_PAID_LEAVE; REJECTED only sets LeaveStatus.REJECTED — no attendance row created/preserved
- Pass 2: re-read spec L520 "REJECTED keeps NPL if absent" + re-read approveLeaveRequest → rejected leaves do not create or preserve any attendance record; absent employee simply has no attendance row
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: REJECTED leave keeps attendance as NPL if employee was absent.
  - Actual: REJECTED only updates leave request status; no attendance row created for absent period.

---

## SECTION VERDICT — §4 People World

| Metric | Count |
|---|---|
| Claims verified | 20 |
| CONFIRMED | 9 |
| DISCREPANCY | 11 (MAJOR: 8, MINOR: 3) |
| AMBIGUOUS | 0 |

### Ranked Discrepancies

1. **[MAJOR] UC-EMP-01** — Employee record missing department (department only on User).
2. **[MAJOR] UC-EMP-02** — User.hierarchyLevel does not exist; hierarchy is on Employee; no role↔level mapping.
3. **[MAJOR] UC-ATT-04** — Paid-leave entitlements are not per-employee; hard-coded annual defaults used.
4. **[MAJOR] UC-ATT-05** — Self check-in/out is not on /m/site/attendance; that page is supervisor bulk; self-service lives on /m/home.
5. **[MAJOR] UC-PAYROLL-02** — PF/insurance not auto-calculated in payroll; no advance/loan model; NPL earns 0 days (not explicitly deducted).
6. **[MAJOR] UC-PAYROLL-03** — Payout does not record payment mode, bank, or cheque photo.
7. **[MAJOR] UC-PAYROLL-04** — Labour cost report is company-level by trade/crew, not per site/month.
8. **[MAJOR] UC-LEAVE-02** — Rejected leave does not preserve NPL attendance for absent employees.
9. **[MINOR] UC-ATT-02** — Attendance enum has 8 values, not 5; uses full names not abbreviations.
10. **[MINOR] UC-DPR-01** — DPR lacks an ETA field; "labor count" is actually hours-based labor lines.
11. **[MINOR] UC-PAYROLL-01** — Payroll status is DRAFT → PROCESSED → PAID, not DRAFT → APPROVED → PAID.

### Action Items

- **UC-EMP-01**: Add `departmentId` to Employee model + accept in createEmployee/updateEmployee, OR document that department is a User-level concept only.
- **UC-EMP-02**: Either move hierarchyLevel to User + add role↔level mapping, OR update spec to reflect Employee.hierarchyLevel.
- **UC-ATT-04**: Add per-employee leave entitlement field (e.g., `Employee.annualLeaveEntitlement`) and wire into leave balance checks + payroll.
- **UC-ATT-05**: Either make /m/site/attendance dual-purpose (worker self + supervisor bulk) OR update spec to reflect /m/home for self check-in.
- **UC-PAYROLL-02**: Auto-calculate PF/ESI/insurance from EmployeeBenefit in generatePayroll; add EmployeeAdvance/Loan model for deductions.
- **UC-PAYROLL-03**: Add paymentMode/chequeBank/chequePhotoUrl fields to PayrollPeriod; record in payPayroll.
- **UC-PAYROLL-04**: Build per-site per-month labour cost report (group payroll lines by project assignment).
- **UC-LEAVE-02**: On REJECTED leave, create WorkerAttendance as NON_PAID_LEAVE for absent days in the leave period.
