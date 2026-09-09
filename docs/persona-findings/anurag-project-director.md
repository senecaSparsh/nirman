# Persona Audit: Anurag Garg — Project Director, SRG REALCON

**Persona:** Anurag Garg, Project Director (`PROJECT_DIRECTOR` role)
**Company:** SRG REALCON
**Phone:** 7302920202
**Reports to:** Vardaan (Owner)
**Audit date:** 2025

---

## 1. Role & Permission Baseline

The `PROJECT_DIRECTOR` role is defined in `apps/web/src/lib/roles.ts` lines 398–432.

### Permissions granted

| Category         | Permissions                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Projects         | `PROJECTS_VIEW`, `PROJECTS_MANAGE`                                                                                     |
| BOQ / WBS / MB   | `BOQ_VIEW`, `BOQ_MANAGE`, `WBS_VIEW`, `WBS_MANAGE`, `MB_VIEW`, `MB_VERIFY`, `MB_APPROVE`                               |
| DPR              | `DPR_VIEW`, `DPR_APPROVE_ADMIN`                                                                                        |
| Procurement      | `PROCUREMENT_VIEW`, `PROCUREMENT_MANAGE`, `PO_APPROVE`, `REQUISITION_APPROVE`, `QUOTATION_VIEW`, `QUOTATION_MANAGE`    |
| Work Orders / RA | `WO_MANAGE`, `RA_APPROVE`                                                                                              |
| Cost Control     | `PROJECT_CONTROL_VIEW`, `FINANCE_VIEW`                                                                                 |
| HR               | `HR_VIEW`                                                                                                              |
| Assets           | `ASSETS_VIEW`, `ASSETS_MANAGE`                                                                                         |
| Gate Pass        | `GATE_PASS_VIEW`, `GATE_PASS_CREATE`, `GATE_PASS_APPROVE`, `GATE_PASS_MANAGE`                                          |
| Other            | `SAFETY_VIEW`, `SAFETY_MANAGE`, `AUDIT_VIEW`, `LEGAL_MANAGE`, `VEHICLE_VIEW`, `USERS_VIEW`, call/telephony permissions |

### Permissions NOT granted (gaps relevant to the persona)

| Missing permission      | Impact                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DPR_SUBMIT`            | Cannot submit DPRs (expected — submitters do this)                                                                                                                                                                                                 |
| `DPR_APPROVE_SUB_ADMIN` | Cannot do sub-admin approval; can only do the final admin approval. This means a DPR must pass through a Project Manager (sub-admin) first before the Project Director can act on it. If no PM is assigned, DPRs are stuck at `SUBMITTED` forever. |
| `RA_SUBMIT`             | Cannot submit RA bills (expected — site engineers / PMs do this)                                                                                                                                                                                   |
| `RA_PAY`                | Cannot mark RA bills as paid. Payment is delegated to `FINANCE_HEAD`. The Project Director can approve but not release payment.                                                                                                                    |
| `PAYROLL_MANAGE`        | Cannot process payroll (expected — HR/Finance handles this)                                                                                                                                                                                        |
| `FINANCE_MANAGE`        | Cannot create/edit finance entries (expected — Finance Head owns this)                                                                                                                                                                             |
| `EXPENSE_APPROVE`       | Cannot approve expenses (delegated to Finance Head)                                                                                                                                                                                                |

**Key finding:** The Project Director has `RA_APPROVE` but NOT `RA_PAY`. This is a deliberate segregation of duties — the PD approves the bill, and the Finance Head releases payment. However, there is no visible handoff notification or workflow status that tells the PD when a bill has been paid.

---

## 2. Journey: Projects Dashboard

### Entry point

`apps/web/src/app/projects/page.tsx`

### What is visible

The projects page (`apps/web/src/components/projects/projects-view.tsx`) shows:

- Table and card views of all non-deleted projects (up to 500 fetched).
- Project status (PLANNED, ACTIVE, COMPLETED, etc.).
- Budget burn: `totalProjectCost` vs `totalBudget`.
- Built-unit sales data (sold/unsold/total).
- Timeline (start/end dates).
- Revenue, profit, and margin summaries from `projectPnl()`.
- Stock location counts and phase counts.
- RERA fields (registration number, validity date).

### What is wired end-to-end

- `apps/web/src/app/projects/page.tsx` checks `PROJECTS_VIEW` (line ~25), gets the company, applies project scope filtering for project-scoped users, fetches projects with built-unit and stock data, and computes P&L in parallel via `projectPnl()`.
- The Project Director has `PROJECTS_VIEW` and `PROJECTS_MANAGE`, so they can see all projects and create/edit them.
- Project links navigate to `/projects/[id]` (the Project Hub).

### What is broken or missing

1. **Budget vs actual cost inconsistency:** The dashboard exposes both `totalProjectCost` (a cached column on `Project`) and `projectPnl.totalCost` (computed by the P&L service). These may diverge if `reallocateProjectCosts()` has not been run recently. The health card appears to use the cached `totalProjectCost` for budget burn, while the P&L card uses the service-computed value. There is no visible "last refreshed" timestamp.

2. **No project-level cost breakdown on the dashboard:** To see cost breakdown (materials, labour, land, RA bills), the PD must click into each project individually. There is no cross-project cost summary or portfolio-level variance view on the main dashboard.

3. **No project filter persistence:** When navigating from the projects list to a project and back, the table/card view state (sorting, filtering) is not preserved.

### What is confusing

- The dashboard shows "margin" and "profit" from `projectPnl()`, but the "budget burn" uses a different cost figure (`totalProjectCost`). These should be reconciled or clearly labeled.

### India-specific gaps

- No RERA compliance dashboard or alert for expiring RERA registrations.
- No GST input credit summary at the project level.

---

## 3. Journey: Project Detail Hub

### Entry point

`apps/web/src/app/projects/[id]/page.tsx`

### What is visible

The Project Hub (`apps/web/src/components/projects/project-hub.tsx`) has tabs:

- Overview (P&L, inventory counts, variance)
- Units (built units)
- Land (parcels)
- Stock (stock location items)
- Costs (project costs)
- BOQ (BOQ items)
- WBS (WBS nodes)
- Work Orders
- MB (Measurement Book entries)
- DPRs

### What is wired end-to-end

The page fetches a large parallel data set: purchase orders, stock transfers, built units, land parcels, stock movements, project costs, material issues, equipment assignments, P&L, open requisition count, BOQ items, WBS nodes, work orders, MB entries, and DPRs. All are serialized and passed to the hub component.

Links from the hub:

- WBS tab → `/wbs?project=...`
- Work Orders tab → `/work-orders?project=...`
- MB tab → `/measurement-book?project=...`
- DPR tab → row click → `/hr/dprs?id=...`, "New DPR" → `/hr/dprs?project=...`

### What is broken or missing

1. **DPR `labourCount` hardcoded to 0** (`apps/web/src/app/projects/[id]/page.tsx` line 544):

   ```ts
   labourCount: 0, // labour lines not counted in this query
   ```

   The DPR query on the hub does not include `_count: { laborLines: true }`, so the labour count column always shows 0. This is misleading for a PD reviewing manpower deployment.

2. **Project variance `labourCostTotal` hardcoded to 0** (`apps/web/src/app/projects/[id]/page.tsx` line 627):

   ```ts
   labourCostTotal: 0, // labour cost not separately tracked per project yet
   ```

   The cost variance chart shows labour cost as zero, making the variance analysis incomplete.

3. **WBS `type` mapped to `status`** (`apps/web/src/app/projects/[id]/page.tsx` line 509):

   ```ts
   status: n.type, // WBS uses type, not status
   ```

   The WBS node `type` (e.g., `ACTIVITY`, `PHASE_NODE`, `MILESTONE`) is mapped into a field named `status`. This is semantically incorrect — the hub likely renders this as a status pill showing "Activity" or "Milestone" instead of a schedule status (not-started, in-progress, completed, overdue).

4. **Work order RA bill counts are just counts, not status breakdown:** The hub shows `_count.raBills` but does not distinguish pending vs approved vs paid bills.

5. **Query parameter consumption:** Links like `/wbs?project=...` and `/work-orders?project=...` pass a `project` query param, but the target pages use a project selector dropdown that defaults to `projects[0]?.id`. The `?project=` param is NOT consumed by the WBS or work-orders pages — they ignore it and default to the first project. This means clicking "View WBS" from Project A's hub may open the WBS page showing Project B (the first in the dropdown).

### What is confusing

- The hub mixes "actual cost" (from `totalProjectCost` cache) with P&L cost (from service). The Overview tab shows both without clear labeling of which is which.

### India-specific gaps

- No RERA milestone tracking on the project hub (e.g., quarterly progress reports to RERA).
- No labour cess / BOQ welfare fund tracking visible.

---

## 4. Journey: Finding and Approving Pending DPRs

### Entry point 1: Pending List

`apps/web/src/app/hr/pending/page.tsx` → redirects from `/approvals`

### What is visible

The pending list aggregates:

- DPRs with `approvalStatus: "SUBMITTED"` (line 67–75)
- Pending leave requests
- Draft payrolls
- Draft purchase orders
- Submitted material requisitions
- Overdue tasks
- Pending tasks

### What is broken or missing

1. **Permission flags computed but never used** (`apps/web/src/app/hr/pending/page.tsx` lines 52–55):

   ```ts
   const _canApproveDpr =
     hasPermission(role, PERM.DPR_APPROVE_SUB_ADMIN) ||
     hasPermission(role, PERM.DPR_APPROVE_ADMIN);
   const _canApprovePo = hasPermission(role, PERM.PO_APPROVE);
   const _canApproveRequisition = hasPermission(role, PERM.REQUISITION_APPROVE);
   const _canManagePayroll = hasPermission(role, PERM.PAYROLL_MANAGE);
   ```

   All four variables are prefixed with `_` and never referenced. The page shows ALL pending sections regardless of whether the user has approval authority. A Project Director who cannot approve payroll still sees "Draft Payrolls to Process" with no way to act on them.

2. **No item-specific links or direct approve buttons:** DPRs link to `/hr/dprs` (the full list page), not to the specific DPR. POs link to `/procurement`. Requisitions link to `/requisitions` (which redirects to `/procurement?tab=indents`). The user must manually find the pending item in the target page.

3. **No DPRs at `SUB_ADMIN_APPROVED` status shown:** The pending list only fetches DPRs with `approvalStatus: "SUBMITTED"`. DPRs that have been sub-admin approved and are awaiting admin (Project Director) approval are NOT shown. This is a critical gap — the PD's primary DPR action is admin approval, but the pending list does not surface items at that stage.

4. **No RA bills or MB entries in the pending list:** The pending list does not include pending RA bills (status `SUBMITTED`) or MB entries awaiting verification/approval. The PD must manually check the work-orders page.

5. **`/approvals` page just redirects** (`apps/web/src/app/approvals/page.tsx`):
   ```ts
   redirect("/hr/pending");
   ```
   The dedicated approvals URL redirects to the pending list, which is HR-centric and incomplete.

### Entry point 2: DPR Page

`apps/web/src/app/hr/dprs/page.tsx`

### What is visible

- DPR table with: date, project, weather, work summary, progress %, approval status, material/labour line counts, submitted-by name.
- Summary stats bar: total, pending, sub-approved, approved, average progress.
- Filters: search, date filters.
- Actions: New DPR, Edit, Delete, Print, Sub-Admin Approve, Admin Approve, Reject, Resubmit, Bulk actions.
- Detail dialog with: work summary, blockers, tomorrow plan, material lines, labour lines, photos.

### What is wired end-to-end

- The page checks `DPR_VIEW` and builds permission flags (`canSubmit`, `canSubAdminApprove`, `canAdminApprove`) from the role (lines 31–35).
- The Project Director gets `canAdminApprove = true` (has `DPR_APPROVE_ADMIN`), `canSubAdminApprove = false`, `canSubmit = false`.
- The DPR view (`apps/web/src/components/hr/dprs-view.tsx`) gates approval buttons:
  - Sub-admin approve button shows when `canSubAdminApprove && approvalStatus === "SUBMITTED" && submittedById !== currentUserId` (line 387–388).
  - Admin approve button shows when `canAdminApprove && approvalStatus === "SUB_ADMIN_APPROVED" && submittedById !== currentUserId` (line 392–393).
- Self-approval is prevented: `d.submittedById !== currentUserId` check on all approval buttons.
- The API route (`apps/web/src/app/api/dprs/[id]/route.ts`) enforces `DPR_APPROVE_ADMIN` for admin approval (line 123) and `DPR_APPROVE_SUB_ADMIN` for sub-admin approval (line 92).
- On admin approval, the API auto-generates a `MaterialIssue` from the DPR's material lines (line 150: `generateMaterialIssueFromDPR`).

### What is broken or missing

1. **DPRs stuck at SUBMITTED if no PM exists:** The Project Director can only approve DPRs at `SUB_ADMIN_APPROVED` status. If no user with `DPR_APPROVE_SUB_ADMIN` permission is assigned (e.g., no Project Manager), DPRs remain stuck at `SUBMITTED` indefinitely. The PD has no way to bypass the sub-admin step.

2. **No self-approval check in the API for admin approval:** The API route for `adminApprove` (line 122–166) does not check whether the approver is the same as the submitter. The UI prevents this (`submittedById !== currentUserId`), but the API does not enforce it. A direct API call could bypass this check.

3. **Photos are visible in the detail dialog** (`apps/web/src/components/hr/dprs-view.tsx` lines 1215–1219): The detail dialog renders `detail.photoUrls` as images. This is correctly wired.

4. **Labour rate hardcoded** (`apps/web/src/components/hr/dprs-view.tsx` line 27):

   ```ts
   const LABOR_RATE_ESTIMATE = 250;
   ```

   The estimated labour cost in DPRs uses a hardcoded ₹250/hour rate. This is not configurable per project or company. For a PD reviewing cost across projects with different labour rates, this produces misleading cost estimates.

5. **Rejection requires a reason (UI and API):** The API checks for `body.reason` or `body.rejectReason` (line 172). The UI has a rejection dialog. This is correctly wired.

6. **WhatsApp notification on approval:** The API sends a WhatsApp notification to the DPR submitter on sub-admin and admin approval (lines 104–113, 135–144). This is a good India-specific feature but is best-effort (wrapped in try/catch with console.warn).

### What is confusing

- The pending list shows DPRs at `SUBMITTED` but the PD can only act on `SUB_ADMIN_APPROVED` ones. The PD sees pending DPRs in the pending list but cannot act on them from there — they must wait for a PM to sub-admin approve first.

### India-specific gaps

- No linkage between DPR material consumption and GST input tax credit.
- Labour rate is hardcoded rather than using state-wise minimum wage rates.

---

## 5. Journey: Finding and Approving Pending Material Requisitions

### Entry point

`apps/web/src/app/requisitions/page.tsx` → redirects to `/procurement?tab=indents`

### What is visible

The procurement page (`apps/web/src/app/procurement/page.tsx`) has tabs including "Indents" which shows the requisitions view (`apps/web/src/components/requisitions/requisitions-view.tsx`).

The requisitions view shows:

- Table or kanban pipeline of indents.
- Columns: indent number, project, status, items, total quantity, requested date, needed-by date.
- Controls: search, status filter, New Indent, auto-generate from low stock, print/export.
- Detail dialog with: lines (material, qty, current stock, last rate, preferred supplier), quote summary, approval/conversion actions.

### What is wired end-to-end

- The page checks `PROCUREMENT_VIEW` and builds `canApproveRequisitions` from `REQUISITION_APPROVE`.
- The Project Director has `REQUISITION_APPROVE`, so they can approve indents.
- The requisition detail API (`apps/web/src/app/api/requisitions/[id]/route.ts`):
  - GET loads project, phase, approval actors, lines, materials, preferred supplier, and quotes (lines 17–106).
  - PATCH supports: `submit`, `approve`, `reject`, `waiveQuotes`, `convert` (lines 117–199).
  - Self-approval prevention (line 141): `if (req?.requestedById === user.id) return 403`.
  - Self-rejection prevention (line 156): same check.
  - Quote waiver requires `PO_APPROVE` permission (line 165) and a reason.
  - Conversion requires `PROCUREMENT_MANAGE` and validates supplier, scope, destination, line costs.

### What is broken or missing

1. **`/requisitions` redirect does not preserve query string:** The redirect (`redirect("/procurement?tab=indents")`) hardcodes the tab. If the user navigates to `/requisitions?project=123`, the project filter is lost.

2. **No direct approve action from the pending list:** The pending list links to `/requisitions` (which redirects to `/procurement?tab=indents`). The user must manually find the specific indent.

3. **Quote compliance is visible but not enforced on approval:** The API's `approve` action (line 134–148) does not check whether the quote requirement is satisfied (min quotes or waiver). The approval can proceed even if `quotesWaived === false` and `nonRejectedQuotes.length < minQuotesRequired`. The quote gate is visible in the UI (`gateSatisfied` field) but not enforced server-side.

4. **LCI (Logistics Centralization Intelligence) decision is visible but not actionable:** The API returns `lciDecision` (recommended scope: COMPANY vs PROJECT), but there is no UI element to accept or override this recommendation during approval.

5. **Approval does not capture notes:** The `approveRequisition` service call (line 144) does not pass `body.notes` or `body.approvalNotes`. The approver cannot attach a comment to their approval decision.

### What is confusing

- The procurement page mixes POs, indents, direct purchases, quotations, and returns in one page with tabs. For a PD who only wants to approve indents, the page is cluttered.

### India-specific gaps

- No GST-inclusive vs exclusive rate display on indent lines.
- No local supplier preference or Make-in-India flag.

---

## 6. Journey: Reviewing a Project's BOQ

### Entry point

`apps/web/src/app/boq/page.tsx`

### What is visible

The BOQ view (`apps/web/src/components/boq/boq-view.tsx`) shows:

- Hierarchical tree: SECTION → SUBSECTION → LINE_ITEM.
- Columns: serial number, description, unit, estimated qty, rate, estimated amount, material link, rate analysis, notes.
- Child node counts (MB entries, WBS links).
- Expand/collapse, expand all/collapse all.
- Add, edit, delete (gated by `BOQ_MANAGE`).
- Rate analysis dialog.

### What is wired end-to-end

- The page checks `BOQ_VIEW`, applies project scope, fetches projects and materials.
- `canEdit` depends on `BOQ_MANAGE` — the Project Director has this.
- BOQ API routes:
  - `apps/web/src/app/api/boq/items/route.ts` — list/create.
  - `apps/web/src/app/api/boq/items/[id]/route.ts` — get/update/delete.
  - `apps/web/src/app/api/boq/tree/route.ts` — hierarchical tree.
- Rate analysis schema (`packages/db/prisma/schema.prisma` lines 5274–5300): one rate analysis per BOQ line item, with components (MATERIAL, LABOUR, EQUIPMENT, OVERHEAD, PROFIT, OTHER), wastage %, and cached subtotals.

### What is broken or missing

1. **No BOQ version/revision control:** The `BoqItem` model (schema lines 5205–5242) has no version field. There is no way to track revisions to the BOQ over time. Once an item's rate or quantity is changed, the previous value is lost. For a PD, this means no audit trail of budget changes.

2. **No BOQ vs MB reconciliation view:** The BOQ view shows MB entry counts per item but does not show cumulative measured quantity vs estimated quantity. The PD cannot see which BOQ items are over/under measured without going to the MB page or cost control.

3. **No GST-inclusive/exclusive rate flag:** The `BoqItem.rate` field (schema line 5217) is a plain `Decimal` with no indication of whether it includes GST. For Indian construction BOQs, this is ambiguous.

4. **No Schedule of Rates (SOR) reference:** BOQ items have free-text descriptions but no link to a standard SOR (e.g., CPWD DSR, state PWD rates). Indian construction typically references standard rate catalogs.

5. **No approved-vs-draft BOQ status:** All BOQ items are immediately editable. There is no "approved" or "frozen" state for the BOQ. A site engineer could modify rates after the PD has approved them.

### What is confusing

- The BOQ tree shows "MB" and "WBS" counts per item, but clicking them does not navigate to the MB or WBS page filtered by that item.

### India-specific gaps

- No CPWD DSR / state PWD rate reference.
- No GST treatment per BOQ item.
- No escalation clause tracking (price adjustment for steel/cement).

---

## 7. Journey: Reviewing a Project's WBS

### Entry point

`apps/web/src/app/wbs/page.tsx`

### What is visible

The WBS view (`apps/web/src/components/wbs/wbs-view.tsx`) shows:

- Hierarchical tree: PROJECT_NODE → PHASE_NODE → ACTIVITY → SUB_ACTIVITY → MILESTONE.
- Columns: code, name, type, planned/actual dates, progress %, duration, status (computed from dates and progress), critical path flag, float.
- BOQ link per node.
- Dependency management: add/remove dependencies with type (FS, SS, FF, SF) and lag days.
- Add, edit, delete (gated by `WBS_MANAGE`).

### What is wired end-to-end

- The page checks `WBS_VIEW`, applies project scope.
- `canEdit` depends on `WBS_MANAGE` — the Project Director has this.
- WBS API routes under `apps/web/src/app/api/wbs/` handle nodes and dependencies.
- The view computes schedule status from dates and progress (lines 94–100): not-started, in-progress, completed, overdue, no-schedule.
- Dependencies are managed via `apps/web/src/app/api/wbs/dependencies/` routes.

### What is broken or missing

1. **Project Hub maps `type` to `status` incorrectly** (as noted in Section 3): The hub shows `n.type` (the node type) as the status, not the computed schedule status. The WBS view itself correctly computes status, but the hub display is wrong.

2. **No critical path computation visible:** The `WbsNode` model has `isCritical` and `totalFloat` fields (schema lines 5362–5364), but there is no visible critical path analysis or Gantt chart. The PD cannot see which activities are on the critical path.

3. **No circular dependency detection in the UI:** The dependency API may prevent circular dependencies, but the UI does not warn the user when adding a dependency that would create a cycle.

4. **`?project=` query param not consumed:** The WBS page defaults to `projects[0]?.id` and does not read the `project` query parameter from the URL. Navigating from the Project Hub's "View WBS" link does not pre-select the correct project.

5. **No auto-progress from MB entries:** The schema comment says "Progress (0-100% — can be auto-computed from MB entries vs BOQ qty)" (schema line 5359), but there is no visible auto-computation. The PD must manually update progress or rely on the MB approval flow (which does update WBS progress on approval — see MB section).

### What is confusing

- The WBS view shows "type" labels (Activity, Milestone, etc.) and separately a computed "status" (overdue, in-progress). The Project Hub conflates these by mapping `type` to `status`.

### India-specific gaps

- No monsoon/seasonal constraint tracking on WBS activities (critical for Indian construction scheduling).
- No statutory approval milestones (e.g., municipal corporation NOC, fire department clearance) as distinct milestone types.

---

## 8. Journey: Reviewing and Approving Pending Subcontractor RA Bills

### Entry point

`apps/web/src/app/work-orders/page.tsx`

### What is visible

The work orders view (`apps/web/src/components/work-orders/work-orders-view.tsx`) shows:

- Project selector dropdown.
- Stats bar: total work orders, active, issued, draft, RA bills count, total work done, total paid, retention held.
- Work order table: WO number, title/subcontractor, scope (item count), work done, paid, retention, RA bills count, status.
- Work order detail dialog: hero metrics (status, work done, advance, paid, retention), financial terms (retention %, TDS %, TDS category, advance, recovery %), scope (BOQ lines with agreed rate vs BOQ rate, progress bar), RA bills list.
- RA bill detail dialog: bill lines (prev/this/total qty, rate, amounts), MB entry references, deduction breakdown (retention, TDS, advance recovery, other), net payable, approval info, print certificate.
- RA bill creation dialog: billing period, preview of unbilled MB entries, estimated deductions.

### What is wired end-to-end

- The page checks `ASSETS_VIEW` (line 27) — the Project Director has this.
- Permissions built (lines 44–48):
  - `canManage` = `WO_MANAGE` — PD has this ✓
  - `canSubmit` = `RA_SUBMIT` — PD does NOT have this ✗
  - `canApprove` = `RA_APPROVE` — PD has this ✓
  - `canPay` = `RA_PAY` — PD does NOT have this ✗
- RA bill actions (`apps/web/src/app/api/ra-bills/[id]/route.ts`):
  - `submit` requires `RA_SUBMIT` (line 63) — PD cannot submit.
  - `approve` / `reject` requires `RA_APPROVE` (line 64) — PD can approve/reject.
  - `pay` requires `RA_PAY` (line 65) — PD cannot pay.
- The RA bill detail dialog shows a deduction breakdown with TDS section reference: "TDS ({tdsPct}% · {tdsCategory} · Sec 194C)" (line 1515).
- The print certificate includes subcontractor GSTIN (line 137: `gstin: true`).
- RA bill creation fetches unbilled MB entries via `/api/ra-bills?preview=unbilled&workOrderId=...`.

### What is broken or missing

1. **No way to find pending RA bills across all projects:** The work orders page requires selecting a project first. There is no cross-project "pending RA bills" view. The PD must check each project individually. The pending list (`/hr/pending`) does not include RA bills.

2. **RA bill submit/approve/pay workflow requires three different roles:**
   - Submit: `RA_SUBMIT` (Project Manager)
   - Approve: `RA_APPROVE` (Project Director)
   - Pay: `RA_PAY` (Finance Head)

   If no PM is assigned to submit RA bills, the PD cannot approve them — they're stuck at DRAFT. Similarly, after the PD approves, the bill goes to APPROVED status and waits for the Finance Head to pay. There is no visible notification to the Finance Head that a bill is ready for payment.

3. **No self-approval check in the RA bill API:** The `approveRaBill` service call (line 77) does not check whether the approver is the same as the submitter. The work order creation and RA bill creation do not track a `createdById` on the `RaBill` model (schema lines 5561–5598 — no `createdById` field). Self-approval is not prevented.

4. **Retention release requires defect liability period to elapse:** The UI shows a "Release Retention" button only when `status === "COMPLETED"` and `canPay` is true (line 855–858). Since the PD does NOT have `RA_PAY`, they cannot release retention. This is delegated to the Finance Head. If the defect liability period has not elapsed, the API returns an error and the UI shows an override dialog requiring a reason (lines 537–569).

5. **No GST separation in deductions:** The RA bill deduction breakdown shows TDS under Section 194C but does not separately show GST TDS (under Section 51 for reverse charge). For Indian construction, GST TDS at 2% (for CGST+SGST) or 12% (for IGST) may apply if the contract value exceeds ₹2.5 lakh. This is not tracked.

6. **No labour cess deduction:** The Building and Other Construction Workers Welfare Cess Act, 1996 mandates a 1% cess on the construction cost. This is not included as a deduction in RA bills.

7. **No security deposit / mobilization advance tracking as separate deductions:** The schema has `otherDeductions` (line 5578) as a catch-all, but there is no structured tracking of security deposit, mobilization advance (separate from the `advanceRecovery`), or performance guarantee.

8. **No RA bill-to-MB reconciliation view:** The RA bill detail shows MB entry references per line, but there is no reverse view: "which MB entries are unbilled" across all work orders. The RA bill creation dialog shows unbilled entries for one work order, but not across all.

### What is confusing

- The "Pay Advance" button (line 846–849) is gated by `canCreate && permissions.canManage`. The PD has `WO_MANAGE`, so they can pay advances. But "Pay Advance" is a financial action — it seems like it should require `RA_PAY` or `FINANCE_MANAGE`. This is a potential segregation-of-duties issue.

- The "Create RA Bill" button (line 776–779) is gated by `canCreate && (status === ISSUED || ACTIVE)`. The PD has `canCreate` (via `ASSETS_MANAGE`) but NOT `RA_SUBMIT`. The RA bill creation POST endpoint (`/api/ra-bills`) likely requires `RA_SUBMIT` or `WO_MANAGE`. The PD can create RA bills but cannot submit them — they'd be stuck at DRAFT.

### India-specific gaps

1. **TDS under Section 194C is correctly modeled** (schema lines 5471–5473, 5485–5489): The `SubcontractorCategory` enum distinguishes INDIVIDUAL (1%), COMPANY (2%), OTHER (2%). The `tdsPct` and `tdsCategory` fields on `SubcontractorWorkOrder` allow per-contract TDS configuration. This is well done.

2. **GST TDS (Section 51) is NOT modeled:** No field for GST TDS deduction on RA bills. For contracts above ₹2.5 lakh, the principal employer must deduct 2% (CGST+SGST) or 12% (IGST) as GST TDS.

3. **Labour cess (1% of construction cost) is NOT modeled:** The BOCW Welfare Cess is mandatory in India.

4. **Retention release after defect liability period is correctly modeled** (schema line 5519: `defectLiabilityMonths`), with an override mechanism requiring a reason. This is good.

5. **No PAN/TAN verification for subcontractors:** The subcontractor model has `gstin` but no PAN or TAN field visible in the RA bill flow. TDS requires PAN; without it, TDS is at 20%.

6. **No payment certificate number or formal numbering:** The print certificate generates a printable HTML, but there is no serialized payment certificate number stored in the database.

---

## 9. Journey: Reviewing Measurement Book Entries

### Entry point

`apps/web/src/app/measurement-book/page.tsx`

### What is visible

The MB view (`apps/web/src/components/measurement-book/mb-view.tsx`) shows:

- Project selector.
- DataTable with: MB number, BOQ item (serial no), description, WBS node (code), measured qty, cumulative qty, measure date, status.
- Actions (gated by `canCreate` which is `MB_VERIFY`): verify (DRAFT → VERIFIED), approve (VERIFIED → APPROVED), reject (DRAFT/VERIFIED → REJECTED).
- Print link per entry.
- New entry dialog: BOQ item, WBS activity (auto-suggested from BOQ link), measured quantity, description, location reference.
- Rejection reason dialog.

### What is wired end-to-end

- The page checks `MB_VIEW`, applies project scope.
- `canCreate` is based on `MB_VERIFY` — the Project Director has `MB_VERIFY` and `MB_APPROVE`.
- MB API (`apps/web/src/app/api/mb-entries/[id]/route.ts`):
  - `verify` requires `MB_VERIFY` (line 38).
  - `approve` requires `MB_APPROVE` (line 45).
  - `reject` requires `MB_VERIFY` (line 52).
  - Delete requires `MB_APPROVE` (line 69) and only for DRAFT entries.
- On approval, the service `approveMbEntry` is called, which also auto-updates WBS progress (the UI shows a toast: "WBS progress auto-updated").

### What is broken or missing

1. **No dimension-based measurement (L × B × D):** The MB entry captures only `measuredQty` (a single Decimal). Indian MB entries per IS 1200 typically record dimensions (length, breadth, depth/height) and compute quantity from them. The current model has no fields for dimensions, number of items, or item-wise calculation. This is a major IS 1200 compliance gap.

2. **No previous/current/cumulative quantity in the entry form:** The schema has `cumulativeQty` (line 5427), but the creation form only captures `measuredQty`. The cumulative is presumably computed by the service. However, the table shows both `measuredQty` and `cumulativeQty`, so this is visible after creation.

3. **No abstract/sheet number:** IS 1200 MB entries are organized in abstract sheets. The current model has `mbNumber` but no sheet/page reference.

4. **No measurement method reference:** IS 1200 defines specific measurement methods for different work items (e.g., concrete measured to nearest 0.01 cum, brickwork to nearest 0.01 sqm). The BOQ unit is shown but there is no IS 1200 method reference.

5. **No verifier/approver name visible in the table:** The table columns do not show who measured, verified, or approved the entry. The `MbEntry` type includes `measuredBy`, `verifiedBy`, `approvedBy` (lines 35–37), but the column definitions (lines 49–103) do not render them. The PD cannot see who verified an entry without opening the detail dialog (which doesn't exist in the current view — there is only the creation dialog and inline actions).

6. **No detail dialog:** The MB view has no detail/preview dialog. Clicking a row does nothing. The PD can only see the columns in the table. There is no way to view the full description, location, approval history, or rejection reason without going to the API.

7. **No photo/attachment support:** The `MeasurementBookEntry` model (schema lines 5417–5461) has no photo or attachment fields. IS 1200 and modern practice often require photos of measured work.

8. **No MB-to-RA bill link visible:** The schema has `raBillLineId` (line 5443) linking MB entries to RA bill lines, but the MB view does not show which entries have been billed. The PD cannot see "billed vs unbilled" status from the MB page.

9. **No contractor/subcontractor reference on MB entries:** The MB entry links to a BOQ item and WBS node, but not directly to a subcontractor. The link goes through the BOQ item → work order line → work order → subcontractor. This is indirect and not visible in the MB UI.

10. **Rejection reason is captured but not visible in the table:** The `rejectReason` field exists in the type (line 38) but there is no column or detail dialog to show it.

### What is confusing

- The "New Entry" button is labeled with `canCreate` which is `MB_VERIFY`. A site engineer with `MB_VERIFY` can create entries, but so can the PD. The label "canCreate" is misleading — it conflates creation and verification permissions.

### India-specific gaps

1. **IS 1200 compliance is minimal:** No dimension-based measurement, no abstract sheets, no measurement method references, no rounding rules per IS 1200.

2. **No measurement in standard units:** IS 1200 specifies units (cum, sqm, rm, nos) and rounding. The BOQ unit is shown but not validated against IS 1200.

3. **No joint measurement record:** IS 1200 requires joint measurement by the contractor and engineer. The current model tracks `measuredById` and `verifiedById` but not the contractor's representative.

4. **No entry-level rate or amount:** The MB entry shows quantity but not the computed amount (qty × BOQ rate). The PD cannot see the financial value of measured work without manual calculation.

---

## 10. Journey: Cost Control / Project Control

### Entry point

`apps/web/src/app/project-control/page.tsx` → redirects to `/cost-control?tab=project-control`

### What is visible

The cost control page (`apps/web/src/app/cost-control/page.tsx`) has tabs:

- **Project Control** (`apps/web/src/components/project-control/project-control-view.tsx`): EVM metrics (PV, EV, AC, CV, SV, CPI, SPI, EAC, VAC), commitments (open indents, open POs, total committed), cost overrun forecast (BOQ item-level budget vs actual vs committed vs projected), material take-off and procurement gap.
- **Budget Variance** (`apps/web/src/components/budget-variance/budget-variance-view.tsx`): Budget vs actual variance.
- **Profit Center** (`apps/web/src/components/profit-center/profit-center-view.tsx`): Profitability analysis.

### What is wired end-to-end

- The page allows access with `FINANCE_VIEW` OR `PROJECT_CONTROL_VIEW` — the PD has both.
- The Project Control view fetches from four API endpoints:
  - `/api/evm?projectId=...` — EVM metrics.
  - `/api/project-commitments?projectId=...` — open indents and POs.
  - `/api/cost-overrun?projectId=...` — BOQ item-level overrun forecast.
  - `/api/material-take-off?projectId=...` — material gap analysis.

### What is broken or missing

1. **Labour cost is zero in project variance:** As noted in Section 3, `labourCostTotal` is hardcoded to 0 in the Project Hub. If the Budget Variance view uses the same data, labour variance will always show zero. Labour cost is only captured through DPR material issues (auto-generated on DPR approval) and payroll — but there is no project-level labour cost aggregation.

2. **EVM AC (Actual Cost) source is unclear:** The EVM API computes AC from material issues, project costs, and possibly RA bills. But if labour cost is not tracked, AC is understated. This makes CPI (Cost Performance Index) unreliable.

3. **No committed cost vs actual cost distinction in the overrun forecast:** The overrun table shows "Actual" and "Committed" separately, but the "Projected" column (actual + committed + pending) may double-count if a committed PO has already been partially received.

4. **No RA bill cost in the overrun forecast:** The cost overrun view compares BOQ budget against material consumption and PO commitments. RA bill work done (subcontractor cost) is not included in the actual cost, making the overrun forecast incomplete for subcontracted work.

5. **No cross-project portfolio view:** The cost control page requires selecting a single project. There is no portfolio-level cost summary comparing budget vs actual across all projects.

### What is confusing

- The Project Control view shows "Estimate at Completion (EAC)" and "Variance at Completion (VAC)" but does not explain the formula used. EAC = BAC / CPI is the standard formula, but the PD may not know this.

### India-specific gaps

- No GST input credit reconciliation in cost control.
- No land cost vs construction cost separation in the variance view (critical for Indian real estate where land is a major cost component).
- No RERA project cost statement format.

---

## 11. Categorized Issue Summary

### Broken

| #   | Issue                                                                                                                   | File & Line                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| B1  | DPR `labourCount` hardcoded to 0 in Project Hub                                                                         | `apps/web/src/app/projects/[id]/page.tsx:544`                                                                          |
| B2  | Project variance `labourCostTotal` hardcoded to 0                                                                       | `apps/web/src/app/projects/[id]/page.tsx:627`                                                                          |
| B3  | WBS `type` mapped to `status` in Project Hub (shows "Activity" instead of schedule status)                              | `apps/web/src/app/projects/[id]/page.tsx:509`                                                                          |
| B4  | Pending list permission flags computed but never used (`_canApproveDpr`, `_canApprovePo`, etc.)                         | `apps/web/src/app/hr/pending/page.tsx:52-55`                                                                           |
| B5  | Pending list only shows DPRs at `SUBMITTED`, not `SUB_ADMIN_APPROVED` (PD's primary action stage missing)               | `apps/web/src/app/hr/pending/page.tsx:68`                                                                              |
| B6  | `?project=` query param not consumed by WBS, Work Orders, or MB pages (links from Project Hub don't pre-select project) | `apps/web/src/app/wbs/page.tsx`, `apps/web/src/app/work-orders/page.tsx`, `apps/web/src/app/measurement-book/page.tsx` |
| B7  | `/requisitions` redirect does not preserve query string                                                                 | `apps/web/src/app/requisitions/page.tsx`                                                                               |
| B8  | No self-approval check in DPR admin approval API (UI prevents it, API does not)                                         | `apps/web/src/app/api/dprs/[id]/route.ts:122-166`                                                                      |
| B9  | No self-approval check in RA bill approval API (no `createdById` on RaBill model)                                       | `apps/web/src/app/api/ra-bills/[id]/route.ts:76-81`, `packages/db/prisma/schema.prisma:5561`                           |
| B10 | MB view has no detail dialog — clicking a row does nothing                                                              | `apps/web/src/components/measurement-book/mb-view.tsx` (entire file — no detail dialog)                                |
| B11 | MB view does not show measuredBy/verifiedBy/approvedBy names in table columns                                           | `apps/web/src/components/measurement-book/mb-view.tsx:49-103`                                                          |
| B12 | MB view does not show rejection reason anywhere                                                                         | `apps/web/src/components/measurement-book/mb-view.tsx:38` (type has field, no UI)                                      |
| B13 | Quote requirement not enforced server-side on requisition approval                                                      | `apps/web/src/app/api/requisitions/[id]/route.ts:134-148`                                                              |
| B14 | Requisition approval does not capture approver notes                                                                    | `apps/web/src/app/api/requisitions/[id]/route.ts:144`                                                                  |
| B15 | "Pay Advance" button gated by `WO_MANAGE` instead of `RA_PAY` or `FINANCE_MANAGE` (segregation of duties issue)         | `apps/web/src/components/work-orders/work-orders-view.tsx:846-849`                                                     |
| B16 | `/approvals` page just redirects to `/hr/pending` which is HR-centric and incomplete                                    | `apps/web/src/app/approvals/page.tsx:6`                                                                                |
| B17 | Pending list does not include RA bills or MB entries                                                                    | `apps/web/src/app/hr/pending/page.tsx:57-135`                                                                          |

### Missing

| #   | Issue                                                                                                         | File & Line                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| M1  | No cross-project "pending RA bills" view                                                                      | `apps/web/src/app/work-orders/page.tsx` (requires project selection)                                      |
| M2  | No BOQ version/revision control                                                                               | `packages/db/prisma/schema.prisma:5205-5242` (no version field)                                           |
| M3  | No BOQ vs MB cumulative reconciliation view                                                                   | `apps/web/src/components/boq/boq-view.tsx` (shows counts only)                                            |
| M4  | No GST-inclusive/exclusive flag on BOQ rates                                                                  | `packages/db/prisma/schema.prisma:5217`                                                                   |
| M5  | No Schedule of Rates (CPWD DSR / state PWD) reference on BOQ items                                            | `packages/db/prisma/schema.prisma:5205-5242`                                                              |
| M6  | No BOQ "approved/frozen" status to prevent post-approval edits                                                | `packages/db/prisma/schema.prisma:5205-5242`                                                              |
| M7  | No critical path visualization (Gantt chart) for WBS                                                          | `apps/web/src/components/wbs/wbs-view.tsx` (tree only)                                                    |
| M8  | No auto-progress computation from MB entries visible in WBS view (happens on MB approval but not retroactive) | `apps/web/src/components/wbs/wbs-view.tsx`                                                                |
| M9  | No MB dimension-based measurement (L × B × D) per IS 1200                                                     | `packages/db/prisma/schema.prisma:5417-5461` (only `measuredQty`)                                         |
| M10 | No MB abstract sheet number                                                                                   | `packages/db/prisma/schema.prisma:5417-5461`                                                              |
| M11 | No MB measurement method reference per IS 1200                                                                | `packages/db/prisma/schema.prisma:5417-5461`                                                              |
| M12 | No MB photo/attachment support                                                                                | `packages/db/prisma/schema.prisma:5417-5461` (no attachment fields)                                       |
| M13 | No MB billed/unbilled status visible in MB view                                                               | `apps/web/src/components/measurement-book/mb-view.tsx` (schema has `raBillLineId` but UI doesn't show it) |
| M14 | No MB entry-level amount (qty × BOQ rate) display                                                             | `apps/web/src/components/measurement-book/mb-view.tsx`                                                    |
| M15 | No joint measurement (contractor representative) field on MB entries                                          | `packages/db/prisma/schema.prisma:5417-5461`                                                              |
| M16 | No GST TDS (Section 51) deduction on RA bills                                                                 | `packages/db/prisma/schema.prisma:5561-5598` (no GST TDS field)                                           |
| M17 | No labour cess (BOCW Welfare Cess, 1%) deduction on RA bills                                                  | `packages/db/prisma/schema.prisma:5574-5578`                                                              |
| M18 | No PAN/TAN field on subcontractor for TDS compliance                                                          | `packages/db/prisma/schema.prisma` (Subcontractor model — no PAN/TAN visible)                             |
| M19 | No payment certificate number stored in database                                                              | `packages/db/prisma/schema.prisma:5561-5598` (no certificate number field)                                |
| M20 | No RA bill cost included in cost overrun forecast                                                             | `apps/web/src/components/project-control/project-control-view.tsx:158-200`                                |
| M21 | No cross-project portfolio cost summary                                                                       | `apps/web/src/app/cost-control/page.tsx` (single project only)                                            |
| M22 | No notification to Finance Head when RA bill is approved and ready for payment                                | `apps/web/src/app/api/ra-bills/[id]/route.ts:76-81` (no notification on approval)                         |
| M23 | No LCI decision actionability in requisition approval UI                                                      | `apps/web/src/app/api/requisitions/[id]/route.ts:89` (returns `lciDecision` but no UI action)             |
| M24 | No configurable labour rate (hardcoded ₹250/hr)                                                               | `apps/web/src/components/hr/dprs-view.tsx:27`                                                             |
| M25 | No RERA compliance dashboard or expiry alerts                                                                 | Not found in codebase                                                                                     |
| M26 | No escalation clause tracking for steel/cement in BOQ                                                         | Not found in schema                                                                                       |
| M27 | No monsoon/seasonal constraint tracking in WBS                                                                | Not found in schema or UI                                                                                 |
| M28 | No statutory approval milestones (NOC, fire clearance) as WBS milestone types                                 | `packages/db/prisma/schema.prisma:5336-5342` (only generic MILESTONE type)                                |

### Confusing

| #   | Issue                                                                                                                   | File & Line                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| C1  | Project Hub shows both `totalProjectCost` (cached) and `projectPnl.totalCost` (computed) without clear labeling         | `apps/web/src/app/projects/[id]/page.tsx`                                  |
| C2  | WBS `type` shown as `status` in Project Hub (shows "Activity" / "Milestone" instead of schedule status)                 | `apps/web/src/app/projects/[id]/page.tsx:509`                              |
| C3  | Pending list shows DPRs at `SUBMITTED` but PD can only act on `SUB_ADMIN_APPROVED` — user sees items they cannot action | `apps/web/src/app/hr/pending/page.tsx:188-203`                             |
| C4  | "canCreate" in MB view is actually `MB_VERIFY` — conflates creation and verification                                    | `apps/web/src/app/measurement-book/page.tsx` (canCreate = MB_VERIFY)       |
| C5  | Procurement page mixes POs, indents, direct purchases, quotations, and returns in one page                              | `apps/web/src/app/procurement/page.tsx`                                    |
| C6  | EVM metrics (EAC, VAC) shown without explaining the formula                                                             | `apps/web/src/components/project-control/project-control-view.tsx:113-125` |
| C7  | "Pay Advance" uses `WO_MANAGE` permission instead of a financial permission                                             | `apps/web/src/components/work-orders/work-orders-view.tsx:846`             |

### India-specific

| #   | Issue                                                                                               | File & Line                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| I1  | TDS under Section 194C is correctly modeled (INDIVIDUAL 1%, COMPANY/OTHER 2%)                       | `packages/db/prisma/schema.prisma:5471-5489` ✓                                                                 |
| I2  | GST TDS under Section 51 is NOT modeled (2% CGST+SGST or 12% IGST for contracts > ₹2.5L)            | `packages/db/prisma/schema.prisma:5561-5598` ✗                                                                 |
| I3  | Labour cess (BOCW Welfare Cess, 1% of construction cost) is NOT modeled                             | `packages/db/prisma/schema.prisma:5574-5578` ✗                                                                 |
| I4  | Retention money and defect liability period are correctly modeled                                   | `packages/db/prisma/schema.prisma:5503,5519` ✓                                                                 |
| I5  | Retention release override with reason is correctly implemented                                     | `apps/web/src/components/work-orders/work-orders-view.tsx:537-569` ✓                                           |
| I6  | IS 1200 measurement compliance is minimal (no dimensions, no abstract sheets, no method references) | `packages/db/prisma/schema.prisma:5417-5461` ✗                                                                 |
| I7  | No joint measurement record (contractor + engineer signature)                                       | `packages/db/prisma/schema.prisma:5417-5461` ✗                                                                 |
| I8  | No PAN/TAN on subcontractor for TDS compliance (TDS at 20% without PAN)                             | Subcontractor model ✗                                                                                          |
| I9  | No CPWD DSR / state PWD Schedule of Rates reference on BOQ                                          | `packages/db/prisma/schema.prisma:5205-5242` ✗                                                                 |
| I10 | No GST-inclusive/exclusive rate flag on BOQ items                                                   | `packages/db/prisma/schema.prisma:5217` ✗                                                                      |
| I11 | No escalation clause tracking for steel/cement/labour                                               | Not found ✗                                                                                                    |
| I12 | No RERA compliance tracking (registration expiry, quarterly reports)                                | Not found ✗                                                                                                    |
| I13 | No monsoon/seasonal scheduling constraints in WBS                                                   | Not found ✗                                                                                                    |
| I14 | No statutory approval milestones (municipal NOC, fire clearance) as distinct WBS types              | `packages/db/prisma/schema.prisma:5336-5342` ✗                                                                 |
| I15 | WhatsApp notification on DPR approval is implemented (India-preferred channel)                      | `apps/web/src/app/api/dprs/[id]/route.ts:104-113,135-144` ✓                                                    |
| I16 | Hardcoded labour rate (₹250/hr) instead of state-wise minimum wage rates                            | `apps/web/src/components/hr/dprs-view.tsx:27` ✗                                                                |
| I17 | No land cost vs construction cost separation in cost variance (critical for Indian real estate)     | `apps/web/src/components/project-control/project-control-view.tsx` ✗                                           |
| I18 | No GST input tax credit reconciliation at project level                                             | Not found ✗                                                                                                    |
| I19 | Payment certificate is printable but not serialized/stored                                          | `apps/web/src/components/work-orders/work-orders-view.tsx:157-248` (generates HTML on the fly, no DB record) ✗ |

---

## 12. Summary of Critical Findings

### Most impactful for the Project Director persona

1. **The pending list is not an actionable approval queue.** It shows items the PD cannot act on (DPRs at SUBMITTED, not SUB_ADMIN_APPROVED) and omits items the PD should act on (RA bills, MB entries). Links go to module pages, not specific items. Permission flags are computed but unused. This is the single biggest UX gap.

2. **No cross-project visibility for RA bill approvals.** The PD must manually select each project to find pending RA bills. There is no "all pending RA bills" view.

3. **MB entries lack IS 1200 compliance.** No dimension-based measurement, no abstract sheets, no joint measurement, no photo evidence. This is a significant gap for Indian construction.

4. **Labour cost is invisible.** Both the Project Hub (`labourCostTotal = 0`) and the cost control view lack labour cost tracking. EVM AC is understated, making CPI unreliable.

5. **Query parameters from Project Hub links are ignored.** Clicking "View WBS" or "View All" from a project's hub opens the target page with the wrong project selected.

6. **Segregation of duties creates dead ends without notifications.** The PD can approve RA bills but cannot pay them (needs Finance Head). The PD can admin-approve DPRs but only after a PM sub-admin approves (needs Project Manager). There are no notifications to bridge these handoffs.

7. **GST TDS and labour cess are missing from RA bill deductions.** TDS under Section 194C is well implemented, but GST TDS (Section 51) and BOCW welfare cess are not modeled.

8. **BOQ has no version control or approval freeze.** Rates and quantities can be changed at any time by anyone with `BOQ_MANAGE`, with no audit trail of changes.
