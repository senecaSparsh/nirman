# Business Analysis — Source Documents → Platform Design

This document captures what was extracted from the client's real paper trail
(the 20-page scanned PDF "Stock Issue Summary of 01/09/2020 to 31/01/2021"
plus 3 hand-drawn ERP whiteboard photos) and maps it to the gap analysis that
drives the next phase of platform work.

It exists so the reasoning behind later schema/service/UI changes is not lost.

---

## 1. The actual operating company

The paper trail belongs to **Testify Overseas** (stamps show minor spelling
drift: "Tastify Overseas", "Testify Oversea Store" — same entity), based in
**Neknampur Industrial Area, Sikandrabad, Distt. Bulandshahr, UP 203205**.

It is a **paddy / rice processing & export plant** — a manufacturing business,
not a real-estate business. The "Stock Issue Summary" the PDF is named after
(page 20) is a 5-month department-wise material consumption report
(01/09/2020 → 31/01/2021), Grand Total **₹1,49,54,608**, broken down across
19 cost centers.

### Cost centers observed (in every document)

`BOILER`, `DRYER`, `MP-1`, `MP-2`, `MP-3` (Milling Plant units),
`PW-1`, `PW-2` (Parboiling / Power), `R.O. PLANT` (water treatment),
`PADDY PERCHAGER` (paddy purchase / intake), `WORK SHOP`, `CIVIL`,
`ELECTRICAL`, `LAB DEPARTMENT`, `OFFICE`, `ADMIN DEPARTMENT`, `DIESEL`,
`GP-1`, `CASH` / `GENERAL ACCOUNT` (accounting heads mixed into the same
list).

The two largest consumers in the summary are **DRYER (₹34.9L)** and
**MP-2 (₹39.4L)** — the core processing lines.

---

## 2. Reconciling this with the hand-drawn ERP notes

The 3 whiteboard photos are the client's own mental model of the platform
they want, and they resolve the apparent contradiction between a "rice mill"
paper trail and a "real-estate" codebase.

- **IMG_0871** — ERP integrates **Inventory + Accounts + HR**. Inventory
  splits into **Raw Material** and **Real Estate**. Raw-material flow:
  *Central Store → Direct company purchase → Purchase+Sale ledger →
  Pricing module → Analysis*. This is exactly the Testify Overseas paper
  trail.
- **IMG_0872** — Real Estate Inventory: unit create/purchase →
  sell/rent/additions/construction/value-add. Admin hierarchy:
  **Admin → Sub-admin → Sub-sub-admin**.
- **IMG_0873** — HR module: Salary, Comparative Analysis, **DPR (Daily
  Progress Report)**, daily labour / work / attendance / time tracking,
  mobile + desktop.

**Conclusion:** this is one conglomerate with two inventory domains that must
coexist in one ERP. The existing "Nirman" real-estate / construction model
(Projects, Land, BuiltUnits) is correct for one half of the business. The
manufacturing / raw-material half (which is what all the real documents are
from) needs a **cost-center-based consumption model that isn't tied to a
Project**, plus HR / payroll, which doesn't exist in the schema at all yet.

---

## 3. Concrete workflows extracted from the paper documents

| Document | What it shows | Numbering |
|---|---|---|
| **Demand slip** (pp. 7-12) | Raising a material requisition shows **live reference data inline**: current closing stock, last supplier, last rate/date — then a supplier comparison table, then **3-tier sign-off: Purchaser → Store → MD** (MD often left blank on low-value demands, suggesting value-based approval tiering) | `PO-01256`, `PO-01258`… |
| **Store Purchase Voucher** (p. 6) | Handwritten dual-copy voucher booking a bill against a supplier before formal GRN | — |
| **Supplier retail challan + Gate-In stamp** (p. 13) | Inbound goods are stamped at a **security gate register** (Gate Entry No., time, date) before reaching the store — a step before GRN that doesn't exist in the schema | Gate Entry No. sequential |
| **Stock Issue voucher** (pp. 5, 14) | Issue slip: To [Department], Receiver Name + Mobile, item/qty/rate/value, roundoff / total in words | `SA-01351`, `SA-00955`… |
| **Sale / Issue register** (pp. 3-4) | Internal issues booked as Tally "Sales" against dept-as-customer | `SA-xxxxx`, resets/continues per book |
| **Purchase register** (pp. 15-18) | Monthly-grouped register, huge vendor variety (hardware, electrical, oil, steel, gas, timber, stationery, weighing systems) | `P-000461`…, resets each **fiscal year** (e.g. `P-000052` in May 2022 vs `P-000521` in Jan 2021) |
| **Saleable Stock Report** (pp. 2, 19) | Company-wide Opening / Receipt / Issue / Balance qty+value snapshot | — |

---

## 4. Gap analysis against the current schema

Checked against `packages/db/prisma/schema.prisma`:

| Finding | Current state | Gap |
|---|---|---|
| Stock can only be issued to a **Project** | `MaterialIssue.projectId` is required; `issueMaterialsToProject()` is the only issue path | No way to issue to an ongoing operational cost center (Boiler, Dryer, Workshop…) that isn't a project |
| Stock locations are only Warehouse or Project Site | `StockLocationType = COMPANY_WAREHOUSE \| PROJECT_SITE` | No `DEPARTMENT` / cost-center concept |
| No gate-in step before GRN | `GoodsReceipt` is the first inbound record | Real workflow stamps a Gate Entry first |
| Single-level requisition approval | `requisition.approve` is one permission | Real workflow is 3-tier (Purchaser / Store / MD) with reference data (last stock / supplier / rate) surfaced at raise-time |
| No HR at all | `Employee` is a bare stub (name/trade/phone/dailyRate) used only for playground task assignment | No Payroll / Salary, Attendance, or DPR models |
| No fiscal-year-scoped document numbering | POs / issues just increment globally via `@unique` | Real books reset each fiscal year (`P-000052` May 2022 vs `P-000521` Jan 2021) |

---

## 5. Phase plan (what this analysis drives)

### Phase 1 — Cost-center inventory (in progress)

The first and highest-value gap. Lets the platform model the actual Testify
Overseas paper trail: raw materials issued to operational departments, with
MAC-based costing and a department-wise consumption report that mirrors the
"Stock Issue Summary" the client already produces by hand.

Scope:
- New `Department` master (soft-deleted, company-scoped) — Boiler, Dryer,
  MP-1/2/3, Workshop, etc.
- `StockLocationType.DEPARTMENT` so a department can hold its own petty stock
  (matches the "WORK SHOP" stock room seen in the paper trail).
- `StockMovementType.ISSUE_TO_DEPARTMENT` — outbound, draws at MAC, MAC
  unchanged (same rule as `ISSUE_TO_PROJECT`).
- `MaterialIssue.projectId` becomes optional; new `departmentId` field. One
  of the two must be set (enforced in the service layer + Zod).
- `issueMaterialsToDepartment()` service — same atomic pattern as
  `issueMaterialsToProject()` (recordMovement + MaterialIssue + GL post +
  audit log inside one Serializable tx), but posts to **Operating Expenses
  (6000)** instead of **WIP - Project Costs (1500)**, and skips
  `reallocateProjectCosts`.
- Issue dialogs gain a **Project / Cost Center** toggle. Cost-center issues
  don't show a phase/subcontractor.
- New **Cost-Center Consumption** report page: date-range filter,
  department-wise totals (rows = departments, columns = material
  categories or materials), grand total — a digital version of the paper
  "Stock Issue Summary".

### Phase 2 — Purchase approval tiering (next)

3-tier Purchaser → Store → MD approval on requisitions, with reference data
(last stock / last supplier / last rate) surfaced inline on the demand slip,
and value-based routing (MD signature optional below a threshold).

### Phase 3 — Gate entry / inbound logging

Security gate-in step before GRN: `GateEntry` model with sequential
per-fiscal-year numbering, supplier + challan + vehicle + time, linked to
the eventual `GoodsReceipt`.

### Phase 4 — HR module

Salary / Payroll, Attendance, and DPR (Daily Progress Report) as described
in IMG_0873. Mobile + desktop.

### Phase 5 — Fiscal-year document numbering

PO / issue / receipt numbers reset per fiscal year instead of incrementing
globally.
