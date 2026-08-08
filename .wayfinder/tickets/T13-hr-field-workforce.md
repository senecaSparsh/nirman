# T13 — HR & Field Workforce Management Module

> Label: `wayfinder:build` · Status: **open** · Claimed by: — · Blocked by: nothing (new module)

## Question

The brother's design specifies a full HR & Field Workforce module that doesn't exist yet. The app
has an `Employee` model (name, trade, phone, dailyRate) and API routes, but no:

- Labor/worker attendance tracking (daily check-in/check-out via mobile)
- Task assignment to individual workers or crews
- Payroll computation (Monthly / Fixed wage structures)
- Daily Progress Reports (DPR) — mobile submission of work completed, materials consumed, labor utilized
- Comparative analysis: planned vs actual progress, workforce productivity, labor costs

This is the biggest missing piece — an entire new module.

## What exists

- `Employee` model in Prisma (name, trade, phone, email, dailyRate, active, companyId, soft delete)
- `Department` model (code, name, description, active)
- API routes: `GET/POST /api/employees`, `GET/PATCH/DELETE /api/employees/[id]`
- No UI page for employees (no `app/employees/page.tsx`)
- No nav item for employees or HR
- No attendance, payroll, or DPR models in the schema
- The Tasks module (T09) has subtasks, comments, activity, time logs — but no labor/worker link

## What needs to be built

### A. Labor & Attendance Tracking
- **Worker model**: extend `Employee` or create `Worker` with fields: trade, wageType (MONTHLY/FIXED/DAILY), monthlySalary, dailyWage, crewId, activeProjectId
- **Attendance model**: `WorkerAttendance` (workerId, date, projectId, checkIn, checkOut, hoursWorked, status: PRESENT/ABSENT/HALF_DAY/OVERTIME, notes)
- **Crew model**: `Crew` (name, projectId, supervisorId, workerIds[]) — group workers into crews
- Mobile-first UI: field supervisor logs attendance from phone

### B. Payroll Logic
- **PayrollPeriod model**: (companyId, month, year, startDate, endDate, status: DRAFT/PROCESSED/PAID)
- **PayrollLine model**: (payrollPeriodId, workerId, daysWorked, amount, overtimeAmount, deductions, netPay)
- Payroll computation: sum attendance × dailyRate (for daily workers), or monthlySalary (for fixed), with overtime and deductions
- GL posting: Dr Salaries Expense, Cr Cash/Bank (or Cr Salaries Payable)
- Audit log for payroll processing

### C. Site Reporting (DPR)
- **DailyProgressReport model**: (projectId, date, submittedById, weather, workSummary, materialsConsumed[], laborUtilized[], progressPct, blockers, notes)
- **DPRMaterialLine**: (dprId, materialId, qty, unitCost) — links to material consumption
- **DPRLaborLine**: (dprId, workerId/crewId, hoursWorked, taskDescription)
- Mobile submission UI for field supervisors
- Daily summary reports for admins
- Comparative analysis: planned vs actual progress, productivity metrics

### D. RBAC for HR
- New permissions: `hr.view`, `hr.manage`, `payroll.view`, `payroll.manage`, `dpr.submit`, `dpr.view`
- SUPERVISOR role can submit DPRs and log attendance
- MANAGER role can process payroll
- ADMIN/OWNER can view all

## Resolution

_(not started — this is a new module build ticket)_
