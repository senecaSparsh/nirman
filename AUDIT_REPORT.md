# Nirman Inventory OS — Full Platform Audit Report

> **Date**: 2026-09-09
> **Method**: 8 parallel department auditors traced every workflow end-to-end
> (frontend page → API route → service → database). Each claim in DECISIONS.md
> marked ✅ was verified against the actual code.
> **Verdict**: The platform is **NOT ready for client use.** The backend is
> largely solid (~90% wired), but there are build-blocking typecheck errors,
> missing pages that 404, broken HTTP method mismatches, missing workflow
> steps, and a security hole. The docs claim everything is ✅ done — reality
> disagrees.

---

## Summary by Severity

| Severity | Count | Impact                                                        |
| -------- | ----- | ------------------------------------------------------------- |
| CRITICAL | 9     | Build broken / security hole / core workflow entirely missing |
| MAJOR    | 16    | Workflow partially broken / missing pages / wrong logic       |
| MINOR    | 18+   | Redirects instead of pages / hardcoded values / doc drift     |

---

## CRITICAL Faults (must fix before any client demo)

### C1. Build-blocking typecheck errors in custom-roles

- **Area**: `apps/web/src/app/api/custom-roles/route.ts`, `[id]/route.ts`, `m/settings/team/page.tsx`
- **Fault**: `pnpm typecheck` fails with 2 errors. `ROLE_TIER` is imported but
  not exported from `lib/roles.ts` (only `roleTier` function is exported).
  `roleTier` is imported but unused in `[id]/route.ts`. `AssignableRole[]` type
  mismatch in mobile team page.
- **Evidence**: `lib/roles.ts:62` (`const ROLE_TIER` — not exported), `route.ts:6`
  imports it. Typecheck output: `error TS2724: '"@/lib/roles"' has no exported
member named 'ROLE_TIER'`.
- **Impact**: Custom role creation/editing/deletion is completely broken. The
  production build (`pnpm build`) will fail if typecheck is a gate.
- **Fix**: Remove `ROLE_TIER` from the import in `route.ts` (keep `roleTier`).
  Remove unused `roleTier` from `[id]/route.ts`. Cast `key: r as string` in
  `m/settings/team/page.tsx`.

### C2. Desktop `/inventory` page is missing — 404

- **Area**: `apps/web/src/app/inventory/page.tsx`
- **Fault**: No page file exists. Navigating to `/inventory` returns 404. The
  mobile equivalent (`/m/inventory`) exists and works.
- **Impact**: Desktop users have no inventory dashboard. This is a core
  module — the client will hit this immediately.

### C3. Desktop `/sales/[id]` page is missing — 404

- **Area**: `apps/web/src/app/sales/[id]/page.tsx`
- **Fault**: No page file. Only `print/page.tsx` and `print-button.tsx` exist.
  Sale details are only accessible via a dialog from `/sales?sale=<id>`.
- **Impact**: Direct links to a sale (e.g. from notifications, emails, search
  results) return 404. `revalidatePath("/sales/${id}")` in the API is wasted.

### C4. Desktop material-sale cancel sends POST but API only accepts PATCH

- **Area**: `material-sales-view.tsx:455-459` (UI) vs `api/material-sales/[id]/route.ts:9` (API)
- **Fault**: Desktop cancel calls `POST /api/material-sales/${id}` with
  `{ action: "cancel" }`, but the API only exports `PATCH`. Returns 405 Method
  Not Allowed. Mobile correctly uses `PATCH`.
- **Evidence**: Verified directly — UI line 456: `method: "POST"`, API line 9:
  `export const PATCH = ...`.
- **Impact**: Desktop users cannot cancel a material sale. The button appears
  to work but fails silently (toast error).

### C5. Self-service attendance check-in/check-out authorization bypass (security)

- **Area**: `api/attendance/self-check-in/route.ts`, `self-check-out/route.ts`
- **Fault**: Any logged-in user can check in/out ANY employee, including
  cross-company. The ownership guard is skipped when `employee.userId` is null
  (unlinked field workers). `self-check-out` doesn't check company or caller at
  all — `_user` and `_company` are assigned but never used.
- **Impact**: IDOR vulnerability. A user can spoof attendance for any employee
  by ID. This is a data-integrity and security issue.

### C6. Customer portal `/portal/sales` page is missing — 404

- **Area**: `apps/web/src/app/portal/sales/page.tsx`
- **Fault**: No page file. The API (`GET /api/portal/sales`) is fully
  implemented, and the portal dashboard fetches it, but `/portal/sales` as a
  standalone route returns 404.
- **Impact**: Customers clicking a "View Sales" link get a blank page.

### C7. `/renovations` is a redirect with no actual page

- **Area**: `apps/web/src/app/renovations/page.tsx`
- **Fault**: Immediately redirects to `/projects`. The API
  (`POST /api/renovations`) is fully implemented, but there is no UI to create
  or manage renovations.
- **Impact**: Renovation module is completely inaccessible from the UI.

### C8. Desktop `/stock-locations` page is missing — 404

- **Area**: `apps/web/src/app/stock-locations/page.tsx`
- **Fault**: No page file. The API exists, mobile page exists, but desktop
  users cannot manage stock locations.
- **Impact**: Desktop users cannot create/edit/delete stock locations.

### C9. Expense budget is never enforced

- **Area**: `packages/services/src/expense.ts`, `expense-form-dialog.tsx`
- **Fault**: `createExpense` never checks `expenseBudget` before allowing
  creation/approval. Budgets exist and variance is reported, but nothing blocks
  or warns when a spend exceeds the budget.
- **Impact**: The entire "budget control" feature is reporting-only. The
  client will see expenses approved over budget with no warning.

---

## MAJOR Faults (workflow partially broken)

### M1. No CLP (construction-linked payment) slab milestone generation

- **Area**: `payment-plan-editor.tsx`, `sale.ts:1644-1694`, `api/sales/[id]/schedule/route.ts`
- **Fault**: The "Auto" payment-plan generator always produces equal monthly
  installments regardless of whether CLP is selected. There is no code path
  for `Booking → Foundation → 4th Slab → 10th Slab` milestones. The owner
  explicitly asked for this (Transcript §6.2).
- **Impact**: The CLP payment schedule — a core owner-voice requirement — does
  not work as described.

### M2. CLP milestone "auto due" cannot be created from UI

- **Area**: `payment-plan-editor.tsx`, `edit-schedule-dialog.tsx`
- **Fault**: The `PaymentPlanItem` type and schedule editor do not expose
  `wbsNodeId`. The backend `checkMilestonePayments` only marks CLP items DUE
  when `wbsNodeId` is set, but users can't set it from the UI.
- **Impact**: Auto-demand notices based on construction progress cannot fire.

### M3. Registry is not a distinct sale lifecycle stage

- **Area**: `packages/services/src/sale.ts:831-899`
- **Fault**: `saleStage` only supports `PENDING → DEPOSIT_RECEIVED →
COMPLETED/CANCELLED`. There is no `ATS`, `BBA`, or `REGISTRY` stage.
  `completeSale` only requires an ATS or BBA document, not registry.
- **Impact**: The owner's requested workflow `Sale Order → ATS/BBA → Registry
→ Complete` is not enforced. A sale can be completed without registry.

### M4. Approvals page is a redirect, batch API cannot reject

- **Area**: `apps/web/src/app/approvals/page.tsx`, `api/approvals/batch/route.ts`
- **Fault**: `/approvals` redirects to `/hr/pending`. The batch API only
  supports `approve`, not `reject`. There is no `decision` field.
- **Impact**: Users cannot reject approvals in batch. The approvals queue is
  not a real page.

### M5. "Link existing user" button in employee dialog is a no-op

- **Area**: `components/hr/employees-view.tsx:597-611`
- **Fault**: `handleLinkUser` only shows a toast and closes. It does not call
  `POST /api/employees/${id}/link-account` even though the API is fully
  implemented.
- **Impact**: HR must manually navigate to the employee profile to link an
  account. The button is misleading.

### M6. Mobile attendance CTA routes workers to a manager-only form

- **Area**: `m/attendance/page.tsx` → `m/site/attendance/page.tsx`
- **Fault**: The "Take Attendance" CTA navigates to a page requiring
  `PERM.HR_MANAGE`. Regular workers hit a 403.
- **Impact**: Workers see an action they cannot complete.

### M7. Mobile `/m/stock` in-transit transfer filters scoped to wrong company

- **Area**: `m/stock/page.tsx:54-55, 63-64`
- **Fault**: Incoming transfers filter `fromLocation: { companyId: company.id }`
  (wrong — source company is usually different). Outgoing filters
  `toLocation: { companyId: company.id }` (should be `fromLocation`).
- **Impact**: In-transit cards are incomplete/missing for many transfers.

### M8. Expense has no separate payment step

- **Area**: `api/expenses/[id]/route.ts`, `expense.ts`
- **Fault**: No `pay` action exists. Approval immediately posts GL. For cash
  expenses, payment is "assumed" at approval. For credit, payment is pushed to
  supplier-payments.
- **Impact**: The workflow `creation → approval → payment` is incomplete.

### M9. Missing desktop `/leads` page

- **Area**: `apps/web/src/app/leads/page.tsx`
- **Fault**: No page file. Leads only live inside `/sales?tab=pipeline`.
- **Impact**: `/leads` URL returns 404.

### M10. Missing desktop `/direct-purchases`, `/purchase-orders`, `/goods-receipts`, `/quotes` pages

- **Area**: All four desktop routes have no `page.tsx`
- **Fault**: These features only exist as tabs inside `/procurement` or as API
  routes. Direct navigation returns 404.
- **Impact**: Deep links and bookmarks to these features break.

### M11. Safety sub-section index pages missing

- **Area**: `/safety/hazards`, `/safety/incidents`, `/safety/inspections`
- **Fault**: Only `[id]/page.tsx` detail pages exist. No index `page.tsx`.
- **Impact**: Direct navigation to these list URLs returns 404.

### M12. `/quality-control/ncr` index page missing

- **Area**: `apps/web/src/app/quality-control/ncr/page.tsx`
- **Fault**: Only `[id]/page.tsx` exists. NCR list is inside `/quality-control`.
- **Impact**: `/quality-control/ncr` returns 404.

### M13. `/project-control` desktop is a redirect

- **Area**: `apps/web/src/app/project-control/page.tsx`
- **Fault**: Redirects to `/cost-control?tab=project-control`. No standalone
  EVM dashboard page.
- **Impact**: Direct navigation doesn't show the EVM view.

### M14. `/real-estate-inventory` root page missing

- **Area**: `apps/web/src/app/real-estate-inventory/page.tsx`
- **Fault**: No page. The actual page is at `/reports/real-estate-inventory`.
- **Impact**: The documented URL 404s.

### M15. Desktop `/portal-listings` is a redirect

- **Area**: `apps/web/src/app/portal-listings/page.tsx`
- **Fault**: Redirects to `/units`. Portal listing management only exists on
  mobile.
- **Impact**: Desktop users cannot manage portal listings.

### M16. Mobile sale completion lacks final payment amount + cheque details

- **Area**: `m/sales/[id]/MobileSaleDetailClient.tsx`
- **Fault**: Completion always uses remaining balance as final payment. No
  `finalPaymentAmount` or cheque fields (no, bank, photo) in the payload.
- **Impact**: Mobile users can't capture cheque details for the final payment.

---

## MINOR Faults (cosmetic / doc drift / redirects)

| #   | Area                                                                                     | Fault                                                             |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| m1  | `/requisitions`                                                                          | Redirect to `/procurement?tab=indents`                            |
| m2  | `/quotations`, `/quotations/[id]`                                                        | Redirects to procurement tabs                                     |
| m3  | `/supplier-payments`                                                                     | Redirect to `/finance?tab=supplier-payments`                      |
| m4  | `/supplier-returns`                                                                      | Redirect to `/procurement?tab=returns`                            |
| m5  | `/vendor-ratings`                                                                        | Redirect to `/suppliers`                                          |
| m6  | `/stock-counts`, `/stock-movements`, `/transfers`, `/scrap-generations`                  | Redirects to `/stock` tabs                                        |
| m7  | `/expenses`, `/expense-budgets`, `/expense-claims`, `/petty-cash`, `/recurring-expenses` | Redirects to `/finance` tabs                                      |
| m8  | `/profit-center`, `/budget-variance`                                                     | Redirects to `/cost-control` tabs                                 |
| m9  | `/customers`, `/crm`                                                                     | Redirects to `/sales` tabs                                        |
| m10 | `/rent`, `/m/rent`                                                                       | Redirects to `/rentals`                                           |
| m11 | `/telephony`, `/sms`                                                                     | Redirects to tabs                                                 |
| m12 | `/forgot-password`, `/reset-password`                                                    | Redirects to `/sign-in` (no self-service reset)                   |
| m13 | `/tasks`                                                                                 | Redirect only                                                     |
| m14 | DPR labor cost estimate                                                                  | Hardcoded ₹250/hr (`LABOR_RATE_ESTIMATE = 250`)                   |
| m15 | Payroll GL Preview button                                                                | Shown to payroll managers but API requires `FINANCE_VIEW` → 403   |
| m16 | GST report                                                                               | Hardcoded GL account codes `1400`/`2100`                          |
| m17 | GL page                                                                                  | Fetches accounts without `companyId` filter                       |
| m18 | Mobile `/m/stock-out`                                                                    | Hardcodes `requireGatePass: true` for all project issues          |
| m19 | `/m/project-control/page.tsx:27`                                                         | `hasPermission(role, PERM.FINANCE_VIEW)` called but result unused |
| m20 | `/api/sales`                                                                             | `revalidatePath("/sales/${id}")` targets non-existent page        |

---

## What IS Working (verified end-to-end)

These workflows were traced and confirmed functional (UI → API → service → DB):

- **Procurement**: Requisition → Quotation → Comparative → PO → Goods Receipt
  (full lifecycle, both desktop + mobile)
- **Stock ledger**: Material receipt → issue → transfer (uses
  `recordMovement`/`recordTransfer` correctly, no direct qty mutation)
- **Stock count → reconciliation**
- **Material sale** (except desktop cancel — see C4)
- **Scrap generation**
- **Land purchase lifecycle**: Booking → BBA/ATS → Registry → Complete
- **Land cost breakup** (all components with manual override)
- **Land partition → valuation → un-partition**
- **NOC/Legal documents**
- **Tenancy/Rentals**: agreement → billing → escalation → tenant change
- **Built units** + production cost allocation
- **Sale creation** + deposit + payment + completion (except registry stage — M3)
- **Broker management** + commission payment
- **Cheque handling** (photo, bank, clear/bounce)
- **T&C cost allocation** (borneBy, extraAmount)
- **Print pages** (sale form, invoice, draft/LOI, PO, GRN, gate pass, etc.)
- **Lead → Customer conversion**
- **Employee creation** + H1-H6 hierarchy + crew/project assignment
- **Attendance** (bulk recording, 5-code status, traffic-light tiers)
- **DPR** create → sub-admin → admin approval → attendance tier green
- **Payroll generation** (auto-salary, 4-lates=half-day, 85% rule)
- **Leave** request → approval
- **Expense claims** (full DRAFT → SUBMITTED → APPROVED → PAID lifecycle)
- **Petty cash** (fund → spend → replenish)
- **Recurring expenses**
- **General ledger** (double-entry posting)
- **Budget variance** reporting
- **Cost control / EVM**
- **Projects** + WBS + BOQ + Work Orders + Change Orders
- **Quality control** + NCR + CAPA
- **Safety** (hazards, incidents, inspections — detail pages work)
- **Measurement book**
- **Equipment** assignment + maintenance
- **Vehicle tracking**
- **Workflow templates** (create, edit, schedule, run)
- **Telephony** (Twilio sync + webhook)
- **SMS** (mobile)
- **Global search**, recent items, barcode scanner, auto-save drafts

---

## Recommended Fix Order

### Phase 1 — Unblock the build + stop the bleeding (do first)

1. **Fix custom-roles typecheck** (C1) — 3 file edits, ~10 min
2. **Fix material-sale cancel** (C4) — change `POST` to `PATCH` in
   `material-sales-view.tsx:456`, ~1 min
3. **Fix attendance authorization** (C5) — add ownership + company checks in
   self-check-in/out routes, ~30 min

### Phase 2 — Fill the 404 holes (client will hit these immediately)

4. **Add `/inventory` desktop page** (C2) — reuse mobile logic
5. **Add `/sales/[id]` desktop page** (C3) — render SaleDetailDialog as page
6. **Add `/portal/sales` page** (C6) — reuse portal dashboard sales fetch
7. **Add `/stock-locations` desktop page** (C8) — reuse mobile logic
8. **Build real `/renovations` page** (C7) — API is ready
9. **Add missing index pages**: `/safety/hazards`, `/safety/incidents`,
   `/safety/inspections`, `/quality-control/ncr` (M11, M12)
10. **Add `/leads`, `/direct-purchases`, `/purchase-orders`, `/goods-receipts`,
    `/quotes` pages** (M9, M10) — or redirect to correct tabs

### Phase 3 — Fix broken workflows

11. **Implement CLP slab milestones** (M1, M2) — owner-voice requirement
12. **Add registry as a sale stage** (M3) — owner-voice requirement
13. **Build real approvals page + reject** (M4)
14. **Fix "Link existing user" no-op** (M5) — call the API
15. **Fix mobile attendance CTA** (M6) — gate or redirect workers
16. **Fix in-transit transfer company scoping** (M7)
17. **Add expense payment step** (M8)
18. **Fix expense budget enforcement** (C9)
19. **Fix mobile sale completion cheque fields** (M16)

### Phase 4 — Polish

20. Decide which redirects (m1-m13) should become real pages vs. documented
    aliases
21. Fix hardcoded values (m14, m16, m17)
22. Fix permission mismatches (m15, m19)
