# Gate Pass System — Design Document

## Overview

Whenever any item physically leaves a gate (warehouse or project site), a **Gate Pass** must be generated with full details (what item, what time, how many, vehicle, driver, destination). The gate pass goes to an **authorized person for approval**. Until approved, the item **cannot leave the gate**.

This document specifies the schema, workflow, service layer, API, UI, and integration points.

---

## §1. Problem Statement & Scope

### What exists today
- The system has **inbound gate tracking** only — `GoodsReceipt` captures `gateInAt`, `gatePassNo` (supplier's pass), `unloadingSlipNo`, vehicle/driver details.
- There is **no outbound gate pass**. When items leave via Material Issue, Stock Transfer, Material Sale, or Supplier Return, no gate pass is generated and no approval is required before physical exit.

### What we need
1. A **GatePass** document generated for every outbound physical movement.
2. Gate pass captures: items (material, qty, unit), exit time, vehicle, driver, destination, purpose.
3. Gate pass goes through an **approval workflow** — an authorized person must approve before items can physically leave.
4. Until approved, the gate security **cannot release** the items.
5. Printable gate pass for the security guard and driver.

### Outbound flows that need gate passes
| Flow | Service Function | Movement Type | Current Approval |
|------|-----------------|---------------|-----------------|
| Material Issue | `issueMaterialsToProject/Department` | `ISSUE_TO_PROJECT/DEPARTMENT` | None |
| Stock Transfer (Dispatch) | `dispatchTransfer` | `TRANSFER_OUT` | None |
| Material Sale | `createMaterialSale` | `SALE` | None |
| Supplier Return (Complete) | `completeSupplierReturn` | `RETURN` | DRAFT→SUBMITTED→COMPLETED |

### Flows that do NOT need gate passes
- Scrap Generation (IN movement)
- Asset Sale (real estate, no physical inventory)
- Stock Count adjustments (accounting, not physical)
- Direct Purchase / Goods Receipt (IN movement)

---

## §2. Schema Design

### 2.1 New Enums

```prisma
enum GatePassStatus {
  DRAFT          // created, not yet submitted for approval
  PENDING        // submitted, awaiting approver
  APPROVED       // approved by authorized person — items can exit
  REJECTED       // rejected by approver
  EXITED         // items have physically left the gate (closed by security)
  CANCELLED      // cancelled before exit
}

enum GatePassCategory {
  MATERIAL_ISSUE     // linked to MaterialIssue
  STOCK_TRANSFER     // linked to StockTransfer
  MATERIAL_SALE      // linked to MaterialSale
  SUPPLIER_RETURN    // linked to SupplierReturn
  MANUAL             // standalone (non-linked, e.g. borrowed tools)
}
```

### 2.2 GatePass Model

```prisma
model GatePass {
  id              String           @id @default(cuid())
  gatePassNumber  String           @unique   // GP-YYMMDD-NNNN
  companyId       String
  projectId       String?
  locationId      String           // gate/location from which items exit

  // Workflow
  status          GatePassStatus   @default(DRAFT)
  category        GatePassCategory

  // Link to source transaction (nullable for MANUAL category)
  refType         String?          // "MaterialIssue" | "StockTransfer" | "MaterialSale" | "SupplierReturn"
  refId           String?

  // Approval
  submittedById   String?
  submittedAt     DateTime?
  approvedById    String?
  approvedAt      DateTime?
  approvalNotes   String?
  rejectedById    String?
  rejectedAt      DateTime?
  rejectionReason String?

  // Exit details (filled by security at gate)
  exitedAt        DateTime?
  exitedById      String?
  exitNotes       String?
  exitPhotos      Json?            // array of { url, fileName? }

  // Vehicle / transport
  vehicleNumber   String?
  vehicleType     String?
  driverName      String?
  driverPhone     String?
  transporterName String?

  // Context
  destination     String?          // where items are going
  purpose         String?
  notes           String?

  // Creator
  createdById     String?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  // Relations
  company         Company          @relation(fields: [companyId], references: [id], onDelete: Restrict)
  project         Project?         @relation(fields: [projectId], references: [id], onDelete: SetNull)
  location        StockLocation    @relation(fields: [locationId], references: [id])
  submittedBy     User?            @relation("GatePassSubmittedBy", fields: [submittedById], references: [id], onDelete: SetNull)
  approvedBy      User?            @relation("GatePassApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)
  rejectedBy      User?            @relation("GatePassRejectedBy", fields: [rejectedById], references: [id], onDelete: SetNull)
  exitedBy        User?            @relation("GatePassExitedBy", fields: [exitedById], references: [id], onDelete: SetNull)
  createdBy       User?            @relation("GatePassCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  lines           GatePassLine[]

  @@index([companyId])
  @@index([projectId])
  @@index([locationId])
  @@index([status])
  @@index([category])
  @@index([refType, refId])
}
```

### 2.3 GatePassLine Model

```prisma
model GatePassLine {
  id              String   @id @default(cuid())
  gatePassId      String
  materialId      String?
  materialCode    String?  // snapshot for print
  materialName    String?  // snapshot for print
  unit            String?  // snapshot for print
  qty             Decimal  @db.Decimal(14, 3)
  description     String?  // for non-material items (tools, equipment)

  gatePass        GatePass @relation(fields: [gatePassId], references: [id], onDelete: Cascade)
  material        Material? @relation(fields: [materialId], references: [id])

  @@index([gatePassId])
  @@index([materialId])
}
```

### 2.4 Document Number Generation

Pattern: `GP-YYMMDD-NNNN` (matching the `SG-YYMMDD-NNNN` / `SP-YYMMDD-NNNN` pattern used by Scrap Generation and Supplier Payment).

```typescript
async function generateGatePassNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `GP-${ymd}-`;
  const count = await tx.gatePass.count({ where: { gatePassNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}
```

---

## §3. Workflow State Machine

```
                    ┌──────────┐
                    │  DRAFT   │  ← created by storekeeper/site engineer
                    └────┬─────┘
                         │ submit()
                         ▼
                    ┌──────────┐
              ┌─────│ PENDING  │  ← awaiting authorized approver
              │     └────┬─────┘
              │          │
        reject()    approve()
              │          │
              ▼          ▼
         ┌──────────┐  ┌──────────┐
         │ REJECTED │  │ APPROVED │  ← items can now physically exit
         └──────────┘  └────┬─────┘
                            │ confirmExit()  ← security confirms items left
                            ▼
                       ┌──────────┐
                       │  EXITED  │  ← gate pass closed
                       └──────────┘

  DRAFT → CANCELLED (creator cancels before submit)
  PENDING → CANCELLED (creator cancels after submit, before approval)
  APPROVED → CANCELLED (admin overrides — rare)
```

### Key invariant
**Stock movement (TRANSFER_OUT, ISSUE_TO_PROJECT, SALE, RETURN) is only executed when the linked GatePass reaches APPROVED status.** Until then, the source transaction stays in a pre-dispatch state.

---

## §4. Integration Strategy — Two Approaches

### Approach A: Gate Pass as a gate before dispatch (RECOMMENDED)

The Gate Pass is created **before** the stock movement executes. The stock movement service checks for an approved gate pass before proceeding.

**For Material Issue:**
1. User creates a Material Issue (currently executes immediately).
2. Instead of executing immediately, the system creates a GatePass in PENDING status with the issue lines.
3. Approver reviews and approves the gate pass.
4. Only then does `issueMaterialsToProject()` execute the stock movement.

**For Stock Transfer:**
1. User creates a transfer (DRAFT).
2. Before dispatch, a gate pass is auto-created in PENDING status.
3. Approver approves the gate pass.
4. `dispatchTransfer()` can now proceed (validates gate pass is APPROVED).

**For Material Sale:**
1. User creates a material sale.
2. Gate pass auto-created in PENDING.
3. Approver approves.
4. Sale stock movement executes.

**For Supplier Return:**
1. Supplier return is SUBMITTED (existing workflow).
2. Before completing, gate pass auto-created in PENDING.
3. Approver approves.
4. `completeSupplierReturn()` executes.

**For MANUAL (standalone):**
1. Security guard or storekeeper creates a manual gate pass for items not linked to any transaction (e.g. borrowed tools, equipment taken for repair).
2. Approver approves.
3. Security confirms exit.

### Approach B: Gate Pass generated at dispatch, approval post-facto

Less secure — items leave before approval. **Not recommended** for the user's requirement ("jab tak ko approve na ho vo gate se na jaye").

### Chosen approach: **Approach A**

---

## §5. Service Layer

### 5.1 New file: `packages/services/src/gate-pass.ts`

```typescript
// Core functions:
export async function createGatePass(input: CreateGatePassInput): Promise<GatePass>
export async function submitGatePass(id: string, userId: string): Promise<GatePass>          // DRAFT → PENDING
export async function approveGatePass(id: string, approverId: string, notes?: string): Promise<GatePass>  // PENDING → APPROVED
export async function rejectGatePass(id: string, rejecterId: string, reason: string): Promise<GatePass>  // PENDING → REJECTED
export async function confirmExit(id: string, securityId: string, exitDetails: ExitDetails): Promise<GatePass>  // APPROVED → EXITED
export async function cancelGatePass(id: string, userId: string): Promise<GatePass>  // DRAFT/PENDING → CANCELLED

// Auto-creation helper (called from Material Issue, Transfer, Sale, Return services):
export async function autoCreateGatePassFromRef(
  tx: Prisma.TransactionClient,
  refType: string,
  refId: string,
  companyId: string,
  locationId: string,
  lines: GatePassLineInput[],
  vehicle?: VehicleInput,
  destination?: string,
): Promise<GatePass>

// Validation helper (called before stock movement execution):
export async function assertGatePassApproved(refType: string, refId: string): Promise<void>
```

### 5.2 Integration into existing services

**`issueMaterialsToProject()` / `issueMaterialsToDepartment()`** in `packages/services/src/issue.ts`:
- Before executing stock movements, call `assertGatePassApproved("MaterialIssue", issueId)`.
- If no approved gate pass exists, throw `ServiceError("Gate pass not approved — items cannot leave the gate", 403)`.

**`dispatchTransfer()`** in `packages/services/src/transfer.ts`:
- Before executing TRANSFER_OUT movements, call `assertGatePassApproved("StockTransfer", transferId)`.

**`createMaterialSale()`** in `packages/services/src/material-sale.ts`:
- Before executing SALE movement, call `assertGatePassApproved("MaterialSale", saleId)`.

**`completeSupplierReturn()`** in `packages/services/src/supplier-return.ts`:
- Before executing RETURN movement, call `assertGatePassApproved("SupplierReturn", returnId)`.

### 5.3 Auto-creation flow

When a user creates a Material Issue / Transfer / Sale / Supplier Return, the API route:
1. Creates the source transaction (in DRAFT or pre-dispatch state).
2. Calls `autoCreateGatePassFromRef()` to create a linked gate pass in DRAFT status.
3. Returns both the transaction and the gate pass ID.
4. User submits the gate pass for approval.
5. Approver approves.
6. User dispatches/confirms — the service validates the gate pass is APPROVED.

---

## §6. Permissions

### 6.1 New permission constants (in `apps/web/src/lib/roles.ts`)

```typescript
GATE_PASS_VIEW:   "gate_pass.view",
GATE_PASS_CREATE: "gate_pass.create",
GATE_PASS_APPROVE: "gate_pass.approve",
GATE_PASS_EXIT:   "gate_pass.exit",    // security guard confirms exit
GATE_PASS_MANAGE: "gate_pass.manage",  // edit/cancel
```

### 6.2 Role-permission matrix

| Role | View | Create | Approve | Exit | Manage |
|------|------|--------|---------|------|--------|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| PROJECT_DIRECTOR | ✅ | ✅ | ✅ | — | ✅ |
| FINANCE_HEAD | ✅ | — | ✅ | — | — |
| PROJECT_MANAGER | ✅ | ✅ | ✅ | — | ✅ |
| PROCUREMENT_MANAGER | ✅ | ✅ | ✅ | — | ✅ |
| HR_MANAGER | ✅ | — | — | — | — |
| SITE_ENGINEER | ✅ | ✅ | — | — | ✅ |
| STORE_KEEPER | ✅ | ✅ | — | ✅ | ✅ |
| ACCOUNTANT | ✅ | — | — | — | — |
| SALES_MANAGER | ✅ | ✅ | — | — | ✅ |
| SUPERVISOR | ✅ | ✅ | — | ✅ | — |
| QAQC_ENGINEER | ✅ | — | — | — | — |

**Key approvers**: PROJECT_MANAGER, PROJECT_DIRECTOR, PROCUREMENT_MANAGER, OWNER, ADMIN, FINANCE_HEAD.

**Security exit**: STORE_KEEPER, SUPERVISOR (the people physically at the gate).

---

## §7. API Endpoints

### 7.1 Collection routes

```
GET    /api/gate-passes              — list (filterable by status, category, location, date)
POST   /api/gate-passes              — create manual gate pass
GET    /api/gate-passes/pending      — pending approvals for current user
```

### 7.2 Item routes

```
GET    /api/gate-passes/[id]         — detail
PATCH  /api/gate-passes/[id]         — action-based: submit, approve, reject, confirmExit, cancel
```

### 7.3 PATCH action body

```json
{ "action": "submit" }
{ "action": "approve", "notes": "OK to release" }
{ "action": "reject", "reason": "Qty mismatch with PO" }
{ "action": "confirmExit", "exitNotes": "...", "exitPhotos": [...] }
{ "action": "cancel" }
```

### 7.4 Auto-creation

No separate endpoint — auto-creation happens inside the existing transaction creation APIs (Material Issue, Transfer, Sale, Return). The response includes a `gatePassId` field.

---

## §8. Notification Events

### 8.1 New event types (in `packages/services/src/notification-event-bus.ts`)

```typescript
GATE_PASS_SUBMITTED = "GATE_PASS_SUBMITTED",   // notify approvers
GATE_PASS_APPROVED  = "GATE_PASS_APPROVED",    // notify creator + security
GATE_PASS_REJECTED  = "GATE_PASS_REJECTED",    // notify creator
GATE_PASS_EXITED    = "GATE_PASS_EXITED",       // notify creator + approver
```

All with `IMMEDIATE` urgency (matching PO_APPROVED, REQUISITION_APPROVED pattern).

### 8.2 Notification recipients

- **GATE_PASS_SUBMITTED**: All users with `GATE_PASS_APPROVE` permission in the company.
- **GATE_PASS_APPROVED**: Creator + all users with `GATE_PASS_EXIT` permission at the location.
- **GATE_PASS_REJECTED**: Creator only.
- **GATE_PASS_EXITED**: Creator + approver.

---

## §9. UI — Desktop

### 9.1 New page: `/gate-passes`

A new top-level page in the desktop sidebar under "Inventory" or as a standalone "Gate Pass" section.

**Tabs:**
1. **All Gate Passes** — DataTable with columns: GP Number, Date, Category, Status, Items, Vehicle, Destination, Approver.
2. **Pending Approvals** — filtered to PENDING status, with Approve/Reject buttons.
3. **Pending Exit** — filtered to APPROVED status, with "Confirm Exit" button for security.

**Filters:** status, category, location, date range.

### 9.2 Gate Pass Form Dialog

For manual gate passes:
- Location (gate) select
- Category (MANUAL default)
- Destination text
- Vehicle details (vehicle number, type, driver name, phone, transporter)
- Purpose / notes
- Line items grid (material select, qty, unit auto-fill; or free-text description for non-material)

### 9.3 Gate Pass Detail Dialog

Shows:
- GP number, status badge, category
- Source transaction link (if linked — click to navigate to the Material Issue / Transfer / Sale / Return)
- Line items table
- Vehicle details
- Approval timeline (submitted by/at, approved by/at, notes)
- Exit confirmation (exited by/at, photos, notes)
- Action buttons based on status and permissions

### 9.4 Integration into existing forms

**Material Issue form** (`issue-form-dialog.tsx`):
- After creating the issue, show a toast: "Gate pass GP-XXXX created — awaiting approval before items can leave."
- Add a "View Gate Pass" link.

**Stock Transfer dispatch**:
- Before the "Dispatch" button, show gate pass status. If no approved gate pass, disable dispatch and show "Awaiting gate pass approval".

**Material Sale form**:
- Same pattern as Material Issue.

**Supplier Return complete**:
- Same pattern.

---

## §10. UI — Mobile

### 10.1 New mobile page: `/m/gate-pass`

A mobile-optimized page for security guards and storekeepers at the gate.

**Sections:**
1. **Pending Exit** — list of APPROVED gate passes ready for physical release. Each card shows GP number, items summary, vehicle. Tap to open detail with "Confirm Exit" button.
2. **Recent** — recently exited gate passes (today).
3. **Create Manual** — quick form for standalone gate passes.

### 10.2 Mobile gate pass detail

- Full item list with quantities
- Vehicle and driver details
- Approver name and approval time
- "Confirm Exit" button (captures GPS, timestamp, optional photo)
- Printable view link

---

## §11. Print Layout

### 11.1 New print page: `/print/gate-pass/[id]`

Following the existing print pattern (`/print/goods-receipt/[id]`, `/print/issue/[id]`):

**Content:**
- Company header + "GATE PASS" title
- GP number, date, time
- Gate/location name
- Destination
- Vehicle: number, type, driver name, phone, transporter
- Item table: S.No, Material Code, Material Name, Qty, Unit
- Approval section: Approved by, approved at, signature line
- Security section: Exit confirmed by, exit time, signature line
- Footer: "This gate pass must be carried by the driver and shown at the gate."

---

## §12. Audit Logging

Every state transition logs to `AuditLog`:

| Action | EntityType | Trigger |
|--------|-----------|---------|
| `GATE_PASS_CREATE` | GatePass | createGatePass() |
| `GATE_PASS_SUBMIT` | GatePass | submitGatePass() |
| `GATE_PASS_APPROVE` | GatePass | approveGatePass() |
| `GATE_PASS_REJECT` | GatePass | rejectGatePass() |
| `GATE_PASS_EXIT` | GatePass | confirmExit() |
| `GATE_PASS_CANCEL` | GatePass | cancelGatePass() |

Pattern: `logAction(tx, { userId, companyId, action, entityType, entityId, before, after })`.

---

## §13. Implementation Phases

### Phase 1 — Core (MVP)
1. Schema: `GatePass`, `GatePassLine`, enums, migration.
2. Service layer: `gate-pass.ts` with all 6 functions.
3. API routes: `/api/gate-passes` collection + item.
4. Permissions: 5 new `PERM.*` constants + role matrix updates.
5. Desktop UI: `/gate-passes` page with list, form, detail, approve/reject/exit.
6. Print layout: `/print/gate-pass/[id]`.
7. Notifications: 4 new event types.

### Phase 2 — Integration
8. Material Issue: auto-create gate pass, block execution until approved.
9. Stock Transfer: auto-create gate pass on dispatch attempt, block until approved.
10. Material Sale: auto-create gate pass, block execution until approved.
11. Supplier Return: auto-create gate pass before complete, block until approved.
12. Update existing forms to show gate pass status and link.

### Phase 3 — Mobile & Polish
13. Mobile page `/m/gate-pass` for security guards.
14. Mobile "Confirm Exit" with GPS + photo capture.
15. Dashboard widget: pending gate pass approvals count.
16. Gate pass register report.
17. Settings: configurable approval routing (e.g. auto-approve below value threshold).

---

## §14. Edge Cases & Decisions

1. **What if a gate pass is rejected?** The source transaction (Material Issue, Transfer, etc.) stays in its pre-dispatch state. The creator can edit and resubmit, or cancel.

2. **Can a gate pass be edited after submission?** No — once submitted, it's locked. If rejected, the creator creates a new one (or we allow edit in DRAFT/REJECTED state).

3. **Partial exits?** Not in Phase 1. The entire gate pass is either exited or not. Phase 2 could support partial exit with remaining qty.

4. **Value-based approval routing?** Like POs (higher value → higher role), we could auto-route gate passes above a threshold to PROJECT_DIRECTOR. Deferred to Phase 3.

5. **What about inbound gate passes?** The existing `GoodsReceipt` gate-in tracking remains as-is. This feature is outbound-only. A future phase could unify inbound + outbound into a single gate register.

6. **Manual gate passes for non-inventory items?** Yes — `GatePassLine` has `description` for items without a `materialId` (tools, equipment, documents).

7. **Multiple gate passes for one transaction?** No — one gate pass per source transaction. If items need to leave in multiple trips, use partial exit (Phase 2).

8. **What if the approver is the same person as the creator?** The system should prevent self-approval (check `approvedById !== createdById` in `approveGatePass()`).
