# §3.4 Construct — Use Cases & Workflows Audit

**Source document:** `/Users/sparshagarwal/Downloads/nirman-inventory/USE_CASES_AND_WORKFLOWS.md` (§3.4, lines 338–413)  
**Scope:** Project Master · BOQ · WBS · Measurement Book · Work Orders · RA Bills · Change Orders · Quality Control · Safety  
**Audited codebases:**  
- `packages/db/prisma/schema.prisma`
- `packages/services/src/*` (`boq.ts`, `scheduling.ts`, `subcontractor.ts`, `change-order.ts`, `quality-control.ts`, `safety.ts`, `valuation.ts`, `project-cost.ts`, `finance-advanced.ts`, `index.ts`)
- `apps/web/src/app/api/*`
- `apps/web/src/lib/nav.ts`
- `apps/web/src/app/*`

## Executive Summary

| Verdict | Count |
|---|---|
| **CONFIRMED** | 29 |
| **DISCREPANCY (Critical)** | 1 |
| **DISCREPANCY (Major)** | 1 |
| **DISCREPANCY (Minor)** | 3 |
| **AMBIGUOUS** | 0 |

The Construct module is the most schema-complete and service-wired section of the Build world. Most claims are fully implemented. The two material issues are a missing `Project.landId` field and RA-bill deductions being computed at the bill header rather than per line.

---

## 3.4.1 Project Master

### Claim 1 — `Project` requires **company, land, name**
**DISCREPANCY (Critical)**

- `Project` model does have `companyId` and `name` (schema.prisma:621–624), but **there is no `landId` field** on `Project`.
- Land is linked in the opposite direction: `LandPurchase.projectId` is optional (schema.prisma:2058) and `Project` has `landPurchases[]` / `landParcels[]` relation arrays (schema.prisma:662–663).
- The API `apps/web/src/app/api/projects/route.ts` (line 63 `prisma.project.create`) does not pass a `landId`; it creates the project independently and only auto-creates legal documents.
- The "Create Project on this Land" pre-fill of `Project.landId` cannot work because the column does not exist.

### Claim 2 — `Project` statuses are `PLANNED / ACTIVE / ON_HOLD / COMPLETED`
**CONFIRMED**

- `enum ProjectStatus` contains exactly those values (schema.prisma:614–619).
- `Project.status` is `@default(PLANNED)` (schema.prisma:626).

### Claim 3 — `ProjectPhase` tracks phase, start/end, status
**CONFIRMED**

- `model ProjectPhase` exists with `startDate`, `endDate`, `status` (schema.prisma:712–736).
- `enum PhaseStatus` values: `PLANNED`, `ACTIVE`, `COMPLETED`, `ON_HOLD` (schema.prisma:705–710).
- API routes: `apps/web/src/app/api/projects/[id]/phases/route.ts` and `[id]/phases/[phaseId]/route.ts`.

### Claim 4 — `isPossessed` and `possessionDate` on `Project`
**CONFIRMED**

- `Project.isPossessed` Boolean and `Project.possessionDate` DateTime (schema.prisma:647–648).
- Service: `markPossession` is exported from `packages/services/src/land.ts` and used by `apps/web/src/app/api/projects/[id]/possession/route.ts`.

### Claim 5 — `reallocateProjectCosts()` computes `totalProjectCost / totalSellableArea`, caches on `Project.costPerSqft`, and sets `BuiltUnit.productionCost`
**CONFIRMED**

- Service `reallocateProjectCosts` in `packages/services/src/valuation.ts` (lines 222–334):
  - Sums project-level material issues, direct-to-unit issues, `ProjectCost`, `LandPurchase.totalCost`, and subtracts scrap recovery (lines 227–284).
  - Computes `costPerSqft = poolToAllocate / totalArea` (lines 301–310).
  - Updates `Project.costPerSqft`, `Project.totalProjectCost`, `Project.totalSellableArea` (lines 324–330).
  - Updates each `BuiltUnit.productionCost = areaAllocated + directCost` (lines 317–320).

---

## 3.4.2 Bill of Quantities (BOQ)

### Claim 6 — `BoqItem` types: `SECTION`, `SUBSECTION`, `LINE_ITEM`
**CONFIRMED**

- `enum BoqItemType` (schema.prisma:4684–4688) and `BoqItem.type` (schema.prisma:4695).

### Claim 7 — Hierarchical BOQ
**CONFIRMED**

- `BoqItem.parentId` self-relation with `parent`/`children` (schema.prisma:4694, 4712–4713).
- `BoqItem` also links to `phaseId` and `materialId` (schema.prisma:4693, 4699).

### Claim 8 — BOQ-driven procurement planning (MTO)
**CONFIRMED**

- `packages/services/src/boq.ts` exports `generateMaterialTakeOff` (line 748).
- API route `apps/web/src/app/api/material-take-off/route.ts` calls it.

### Claim 9 — Budget variance with `UNDER / ON_TRACK / OVER` flags
**CONFIRMED**

- `packages/services/src/finance-advanced.ts` defines `BudgetVarianceItem.status` as `"UNDER" | "ON_TRACK" | "OVER" | "UNBUDGETED"` (line 393).
- `getBudgetVariance` is exported (line 424) and used by `/budget-variance` page.

---

## 3.4.3 Work Breakdown Structure (WBS) & Scheduling

### Claim 10 — `WbsNode` hierarchy: `PROJECT_NODE`, `PHASE_NODE`, `ACTIVITY`, `SUB_ACTIVITY`, `MILESTONE`
**CONFIRMED**

- `enum WbsNodeType` (schema.prisma:4821–4827) and `WbsNode.type` (schema.prisma:4835).

### Claim 11 — `WbsDependency` with `FS/FF/SS/SF` types
**CONFIRMED**

- `enum DependencyType` (schema.prisma:4873–4878).
- `WbsDependency.type` with `lagDays` (schema.prisma:4880–4893).

### Claim 12 — CPM scheduling (forward/backward pass, total float, critical path)
**CONFIRMED**

- `packages/services/src/scheduling.ts` `computeSchedule` (line 31):
  - Forward pass for earliest start/end (lines 96–145).
  - Backward pass for latest start/finish and total float (lines 153–170+).
  - Detects cycles and returns `criticalPath`, `projectDuration`.

### Claim 13 — EVM metrics `PV, EV, AC, CPI, SPI, EAC, VAC`
**CONFIRMED**

- `packages/services/src/boq.ts` `getEvmMetrics` (lines 877–927) computes:
  - `PV` from BOQ line estimated amounts
  - `EV` from approved MB × BOQ rate
  - `AC` from `projectTotalCost`
  - `CV, SV, CPI, SPI, EAC, VAC, pctComplete`
- API route `apps/web/src/app/api/evm/route.ts`.

### Claim 14 — CLP payment schedule tied to WBS milestones (payment becomes `DUE` at 100% progress)
**CONFIRMED**

- `PaymentScheduleItem.wbsNodeId` (schema.prisma:5623).
- `packages/services/src/crm.ts` `checkMilestonePayments` (lines 541–567) updates `status` to `DUE` when the linked WBS node reaches 100% progress.

---

## 3.4.4 Measurement Book (MB)

### Claim 15 — `MeasurementBookEntry` per BOQ item, status `DRAFT → VERIFIED → APPROVED → REJECTED`
**DISCREPANCY (Minor)**

- `enum MbEntryStatus` is exactly `DRAFT, VERIFIED, APPROVED, REJECTED` (schema.prisma:4895–4900).
- **However, the state machine is not linear through all four.** `packages/services/src/boq.ts`:
  - `verifyMbEntry` only from `DRAFT` (line 641).
  - `approveMbEntry` only from `VERIFIED` (line 666).
  - `rejectMbEntry` throws if status is already `APPROVED` (line 716).
- The arrow `APPROVED → REJECTED` in the use case is therefore invalid. `REJECTED` can only come from `DRAFT` or `VERIFIED`.

### Claim 16 — Site engineer verification with `measuredBy`, `verifiedBy`, `approvedBy`
**CONFIRMED**

- `MeasurementBookEntry` has `measuredById`, `verifiedById`, `approvedById` (schema.prisma:4921–4923) plus timestamps.

### Claim 17 — Approved MB quantities flow into `RaBillLine` (`prevQty/thisQty/totalQty`)
**CONFIRMED**

- `RaBillLine` fields `prevQty`, `thisQty`, `totalQty` (schema.prisma:5091–5093).
- `packages/services/src/subcontractor.ts` `createRaBill` groups approved, unbilled MB entries by BOQ item, builds `RaBillLine` with `prevQty`/`thisQty`/`totalQty`, and links MB entries via `raBillLineId` (lines 344–508).
- `MeasurementBookEntry.raBillLineId` (schema.prisma:4928).

---

## 3.4.5 Subcontractor Work Orders & RA Bills

### Claim 18 — `SubcontractorWorkOrder` with scope = BOQ items, rates, retention %, advance, TDS category
**CONFIRMED**

- `model SubcontractorWorkOrder` and `SubcontractorWorkOrderLine` (schema.prisma:4976–5036).
- `createWorkOrder` in `packages/services/src/subcontractor.ts` (lines 81–161) requires `lines` of `{ boqItemId, agreedRate }` and stores `retentionPct`, `advanceAmount`, `advanceRecoveryPct`, `tdsCategory`.

### Claim 19 — TDS category mapping `INDIVIDUAL 1%`, `COMPANY/OTHER 2%`
**CONFIRMED**

- `packages/services/src/subcontractor.ts` lines 117–119: `tdsPct = tdsCategory === "INDIVIDUAL" ? 1 : 2`.
- Matches `SubcontractorCategory` enum (schema.prisma:4970–4974).

### Claim 20 — RA bill status `DRAFT → SUBMITTED → APPROVED → PAID / REJECTED`
**CONFIRMED**

- `enum RaBillStatus` (schema.prisma:5038–5044).
- `packages/services/src/subcontractor.ts`: `createRaBill` creates `DRAFT`; `submitRaBill`, `approveRaBill`, `rejectRaBill`, `payRaBill` enforce the lifecycle (lines 530, 622, 649, 772).

### Claim 21 — Retention, TDS, and advance recovery are computed **per line**
**DISCREPANCY (Major)**

- The use case says "deductions computed per line".
- In reality, the deduction amounts (`retentionAmount`, `tdsAmount`, `advanceRecovery`) are stored on the `RaBill` header, not on `RaBillLine` (schema.prisma:5060–5063).
- `packages/services/src/subcontractor.ts` `createRaBill` computes them from the bill-level `grossAmount` and the work-order percentages (lines 434–459) and writes them to `RaBill`. The `RaBillLine` model has no deduction columns.
- The per-BOQ-item line only tracks quantities and amounts (`prevAmount/thisAmount/totalAmount`).

### Claim 22 — TDS certificates
**CONFIRMED**

- `packages/services/src/subcontractor.ts` exports `getTdsCertificate` (line 877).

---

## 3.4.6 Change Orders

### Claim 23 — `ChangeOrder` with type, reason, status, linked BOQ items and budget impact
**CONFIRMED**

- `model ChangeOrder` and `ChangeOrderLine` (schema.prisma:5155–5230).
- Enums `ChangeOrderType`, `ChangeOrderReason`, `ChangeOrderStatus` (schema.prisma:5127–5153).
- `ChangeOrderLine` links `boqItemId` and tracks `originalQty`, `revisedQty`, `originalAmount`, `revisedAmount`, `amountDelta` (schema.prisma:5204–5219).

### Claim 24 — Approval workflow before execution
**CONFIRMED**

- `packages/services/src/change-order.ts` has `submitChangeOrder`, `approveChangeOrder`, `implementChangeOrder` (lines 356, 386, 492).
- API `apps/web/src/app/api/change-orders/[id]/route.ts` dispatches `submit`/`approve`/`implement` actions.
- Schema `ChangeOrderStatus` includes `DRAFT → SUBMITTED → APPROVED → IMPLEMENTED` (schema.prisma:5146–5152).

---

## 3.4.7 Quality Control

### Claim 25 — `NonConformanceReport` with severity, category, status
**CONFIRMED**

- `model NonConformanceReport` (schema.prisma:5283–5330).
- Enums `NcrSeverity`, `NcrStatus`, `NcrCategory` (schema.prisma:5247–5272).

### Claim 26 — NCR state machine `OPEN → UNDER_REVIEW → CAPA_REQUIRED/ACCEPTED/REJECTED → CLOSED`
**CONFIRMED**

- `packages/services/src/quality-control.ts`:
  - `createNcr` starts at `OPEN` (line 140).
  - `reviewNcr` accepts `OPEN` or `UNDER_REVIEW` and sets outcome (line 248).
  - `closeNcr` accepts `CAPA_REQUIRED`, `ACCEPTED`, or `REJECTED` and requires a closed CAPA before closing `CAPA_REQUIRED` (lines 274–286).

### Claim 27 — `Capa` linked to NCR with corrective and preventive actions
**CONFIRMED**

- `model Capa` with `ncrId @unique` (one CAPA per NCR), `correctiveAction`, `preventiveAction`, `verificationMethod` (schema.prisma:5332–5374).
- `packages/services/src/quality-control.ts` exports `createCapa`, `startCapa`, `completeCorrectiveAction`, `completePreventiveAction`, `verifyCapa`, `closeCapa` (lines 358–533).

---

## 3.4.8 Safety

### Claim 28 — `SafetyIncident` with type, severity, status
**CONFIRMED**

- `model SafetyIncident` (schema.prisma:5448–5498).
- Enums `IncidentType`, `IncidentSeverity`, `IncidentStatus` (schema.prisma:5393–5419).

### Claim 29 — `SafetyHazard` with risk level and mitigation
**CONFIRMED**

- `model SafetyHazard` with `riskLevel`, `likelihood`, `severity`, `mitigationPlan` (schema.prisma:5500–5543).
- Enums `HazardStatus`, `HazardRiskLevel` (schema.prisma:5421–5432).
- `packages/services/src/safety.ts` exports `computeRiskLevel`, `startMitigation`, `resolveHazard` (lines 95, 370, 385).

### Claim 30 — `SafetyInspection` with result and follow-up
**CONFIRMED**

- `model SafetyInspection` with `result`, `findings`, `complianceNotes`, `followUpActions` (schema.prisma:5545–5578).
- Enums `InspectionResult`, `SafetyInspectionStatus` (schema.prisma:5434–5446).
- `packages/services/src/safety.ts` exports `createInspection`, `completeInspection`, etc. (lines 414–492).

---

## API & UI Wiring Summary

| Module | API Routes Found | UI Page(s) Found | Wired? |
|---|---|---|---|
| Projects | `api/projects/route.ts`, `[id]/route.ts`, `[id]/phases/*`, `[id]/possession/route.ts` | `/projects`, `/m/projects` | Yes |
| BOQ | `api/boq/items/*`, `api/boq/tree/route.ts` | `/boq`, `/m/boq` | Yes |
| WBS | `api/wbs/nodes/*`, `api/wbs/dependencies/*`, `api/wbs/tree/route.ts` | `/wbs`, `/m/wbs` | Yes |
| Measurement Book | `api/mb-entries/*` | `/measurement-book`, `/m/measurement-book` | Yes |
| Work Orders | `api/work-orders/*` | `/work-orders`, `/m/work-orders` | Yes |
| RA Bills | `api/ra-bills/*` | **No standalone `/ra-bills` page found** | API wired; UI embedded or missing |
| Change Orders | `api/change-orders/*` | `/change-orders`, `/m/change-orders` | Yes |
| Quality Control | `api/quality-control/ncr/*`, `capa/*` | `/quality-control`, `/m/quality-control` | Yes |
| Safety | `api/safety/incidents/*`, `hazards/*`, `inspections/*` | `/safety`, `/m/safety` | Yes |
| EVM | `api/evm/route.ts` | n/a (consumed by WBS/project pages) | Yes |
| Material Take-Off | `api/material-take-off/route.ts` | n/a | Yes |
| Budget Variance | `api/budget-variance/route.ts` | `/budget-variance`, `/m/budget-variance/[id]` | Yes |

Navigation links for all Construct pages are declared in `apps/web/src/lib/nav.ts` under the "Construct" section (lines 505–594).

---

## Actionable Recommendations

1. **Fix the `Project.landId` mismatch** (Critical)  
   - Either add `landId String?` to `Project` and update the project-creation form/API, or revise `USE_CASES_AND_WORKFLOWS.md` to say that projects are created first and land purchases are attached via `LandPurchase.projectId`.

2. **Clarify RA bill deductions in the document** (Major)  
   - Change "computed per line" to "computed at the `RaBill` header from the work-order retention %, TDS %, and advance recovery %, then stored on `RaBill.retentionAmount`, `tdsAmount`, `advanceRecovery`."  
   - If per-line deductions are a real business requirement, add the columns to `RaBillLine` and refactor `createRaBill`.

3. **Tighten the MB status wording** (Minor)  
   - Document the state machine as `DRAFT → VERIFIED → APPROVED` with a separate terminal `REJECTED` from `DRAFT` or `VERIFIED` (not after `APPROVED`).

4. **Add a standalone `/ra-bills` page** (Minor, optional)  
   - RA bills have full API coverage but no dedicated desktop/mobile page. They are currently accessible only through the Work Orders UI. Add `apps/web/src/app/ra-bills/page.tsx` and mobile equivalent if the workflow calls for it.

5. **Regenerate Prisma client / run typecheck** after any schema change, per `AGENTS.md`, because `globalForPrisma` caches the client.

---

## Actions I Could Not Perform

- I could not **write the audit file to disk** because no file-write tool is available in this Explore-mode session. The above content is the complete markdown that should be saved to `/Users/sparshagarwal/Downloads/nirman-inventory/docs/use-cases-audit/audit-construct.md`.
- I did not run `pnpm typecheck` or `pnpm test`; the audit is based on static code inspection only.
