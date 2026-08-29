# User Session Business-Logic Notes (Real-Life Owner Interviews)

> **Source**: Verbatim transcripts from onboarding sessions with an actual construction +
> real-estate business owner (Alpha Road project, SRG Realcon). Files in repo root:
> `Alpha Road.txt`, `Alpha Road 2.txt`, `Alpha Road 3.txt`, `Alpha Road 4.txt`,
> `Alpha Road 5.txt`, `Amoria Cafe.txt`.
>
> **Why this exists**: These transcripts capture *how the business actually runs* — the
> sequence of steps, the mandatory-vs-optional fields, the document trail, the approval
> gates. They are the ground truth for refining the app so every page/button matches the
> owner's mental model.
>
> **⚠️ Important — read `DECISIONS.md` alongside this.** A schema audit (2026-08-25)
> found that **most items marked GAP below are actually already modeled in the Prisma
> schema** — the real gap is UI wiring, not missing modules. See `DECISIONS.md` §
> "The one finding that matters most" for the corrected picture. The GAP flags here
> are preserved for traceability but should be verified against the schema before
> planning any build work.
>
> **Convention**: Speaker 1 = the owner/user; Speaker 2/3 = the developer. Hindi/Hinglish
> translated to English with original intent preserved.

---

## 1. Procurement & Materials (Alpha Road.txt)

### 1.1 Material Catalog Creation
- **Item code**: auto-generate from material name + category (e.g. cement → `CEM001`).
  If a repeat name is entered, auto-create with incremented suffix. Owner does NOT want
  to manually assign item codes.
- **Category**: required (e.g. Cement → Grade 1 / Grade 2 / Grade 3).
- **Unit**: required (e.g. Bag).
- **HSN code & GST rate**: should **auto-fetch from the government GST portal** — the
  government maintains HSN (products) and SAC (services) classifications. Owner expects
  these to populate automatically, with `0%` shown if the government has no GST on an
  item. If a quotation later arrives with GST on an item the portal shows as 0%, the
  system should flag the mismatch.
- **Standard cost**: BOTH options needed — (a) manual entry, AND (b) "pull from previous
  purchase" (auto-fill from the last PO line for this material).
- **Reorder point**: threshold-based; when stock drops below it, the system suggests a
  replenishment. (Already implemented via `generateAutoRequisition()`.)
- **Description**: optional free-text.

### 1.2 Rent Module — NEW GAP (services/SAC)
- The owner rents out equipment/property to clients. Rent is a **service**, so it falls
  under **SAC** (Service Accounting Code), NOT HSN.
- **GAP**: A dedicated **Rent module** is needed (separate from equipment assignment).
  See T14 ticket + §6 below.

### 1.3 Purchase Order Flow — The "Comparative Analysis" Gate
This is the owner's strongest, most-repeated point. The current PO form jumps straight
to "select supplier + location". The owner's real-world flow is:

1. **Create suppliers** (one-time, bulk import via Excel supported). Supplier is
   *overall* (not material-specific) — a supplier can supply many materials.
2. **Collect quotations** from multiple suppliers for a material/requisition. The
   employee uploads each supplier's quote (rate + terms).
3. **Comparative Analysis** screen: shows all suppliers side-by-side with their rates.
   Owner picks the cheapest → **PO is auto-created in that supplier's name** with their
   rate pre-filled.
4. PO is the *final* document sent to the vendor. You cannot create a PO without first
   selecting a supplier — supplier + location are effectively mandatory at PO time.

> **Status**: The Comparative Quote Engine (`quote-comparison.ts`) already implements
> ≥3 quotes, cheapest-flagging, waiver, and PO conversion with winning line costs.
> The UX gap is that the mobile PO form surfaces "Add Supplier / Add Stock Location"
> as a dead-end instead of routing through the quotation/comparative-analysis flow
> first. The owner explicitly wants: from the PO page, a button to "Comparative
> Analysis" showing all suppliers + their rates for the material, pick one → PO
> auto-fills.

### 1.4 Supplier Creation
- Supplier is company-wide, not material-specific.
- GST/VST details are NOT mandatory at creation (owner creates suppliers with just a
  name — "Supplier X" — and adds details later).
- **Bulk import** via Excel for existing supplier lists.
- Quick-action to add a supplier should be reachable from the PO page (not buried in
  a separate Suppliers section).

---

## 2. Real Estate — Land & Projects (Alpha Road 2.txt)

### 2.1 Land as an Independent Module
- Land is purchased **before** a project exists. Land must NOT require a project.
- Land can be held standalone (for future sale or future project).
- A land purchase can later be converted into a project (action on the land detail
  page: "Create Project on this Land").

### 2.2 Land Types
- **Freehold** — permanent ownership (e.g. 500 years). Ours forever.
- **Leasehold** — leased from an authority (government) for 90–100 years. We are
  "owners" but revert after the lease term.
- **GAP**: Land type (FREEHOLD / LEASEHOLD) must be a field on `LandPurchase`.

### 2.3 Land Cost Breakup — NEW GAP
Total land cost = Land cost + Lease rent + GST + Registration charges + Stamp duty.
All four add-ons are **optional** and **percentage-based** (with manual override):

| Component | Calculation | Notes |
|---|---|---|
| Land cost | base amount | always present |
| Lease rent | **one-time OR yearly** (both options) | percentage of land cost; for leasehold land |
| GST | percentage | manual entry allowed (no fixed rule in India) |
| Registration charges | percentage | manual entry; amount auto-derived from % |
| Stamp duty | percentage | manual entry; amount auto-derived from % |

- Percentages are NOT fixed — must be entered every time (they vary by state/deal).
- "X% of Y amount = Z" display, with manual amount override.
- Same cost breakup reappears on **sale** (see §3.3) with a "borne by client or seller"
  toggle per component.

### 2.4 Land Subdivision (Partition)
- Owner divides a parcel (e.g. 1000 sq yards) into plots of varying sizes
  (100, 200, 300, 400 sq yards).
- Each subdivided plot becomes an **individual entity** with its own:
  - Plot number (1A, 1B, 1C…)
  - Area
  - **Valuation** (estimated value) AND **asking price** (can be higher or lower)
  - Status: **Available / Sold / Rented**
- On subdivision confirmation: parent land ceases to exist (status → PARTITIONED),
  child plots are created in inventory.
- Subdivision entry captures plot number + valuation + asking price + area per plot
  at subdivision time (not after).
- **Undo subdivision**: only the owner can undo — re-merge plots back into parent
  land. No one else has this permission.
- Subdivided plots CANNOT have a project built on them directly — they are saleable
  inventory. To build, you create a project on an un-subdivided land.

> **Status**: Partition logic exists (`LandPartition`, area conservation). GAPs:
> (a) per-plot valuation + asking price captured at partition time, (b) "Rented"
> status, (c) owner-only undo, (d) Freehold/Leasehold type.

### 2.5 Project Creation
- Project requires: **company** (which company owns it), **land** (which land it's
  built on), **name**.
- Project statuses: Planned / Active / On Hold / Completed (owner added "Active" —
  currently the schema may be missing this exact value).
- Projects, land, and inventory are all linked by company — switching company
  filters everything.

### 2.6 Permissions & NOC Module — NEW GAP
Both land and projects need a **Permissions / Legal / NOC** tab:
- Map sanction (first permission needed before building)
- Fire NOC
- Airport authority NOC
- Many other government permissions
- Each NOC has: type, status (pending/approved), document upload, expiry date.
- **GAP**: No NOC/Legal-permission model exists. This is a new sub-module under both
  Land and Project.

### 2.7 Possession Tracking
- Land and Project both need a **possession** flag/toggle: do we have physical
  possession of this land/project site?
- **GAP**: Add `possessionStatus` (PENDING / POSSESSED) + `possessionDate` to
  `LandPurchase` and `Project`.

---

## 3. Sales (Alpha Road 3.txt, Alpha Road 4.txt)

### 3.1 Sales Order Fields
- Buyer name + phone (phone not strictly required)
- **Advance amount** received
- What's being sold: plot number / project unit / whole project
- **Deal maturity** — how many months until the deal matures
- **Payment plan** — e.g. 25% every month; instalment schedule
- **Payment cycle** — when each instalment is due
- **Broker or self** — if a broker is involved, broker name + commission amount +
  commission payment status (received/pending)
- **Mode of payment** + **bank** + **cheque photo upload** (cheques can bounce, so
  the cheque image is evidence until cleared)

### 3.2 Printable Sales Form
- A printable receipt/agreement generated from the sales order:
  - Project name (top)
  - Unit/land identifier
  - Deal price
  - Advance paid
  - Balance + payment plan
  - Terms & conditions
- Given to the buyer at the time of advance.

### 3.3 Terms & Conditions — Cost Allocation
The same cost components from land purchase (§2.3) reappear on sale, each with a
**"borne by client or seller"** toggle:
- Registration charges
- Stamp duty
- Transfer charges
- Lease rent
- GST
- Plus **manual free-text T&C** for anything else (e.g. "Fire NOC to be obtained by
  seller within 1 month", "Airport authority NOC extra ₹5 lakh beyond deal price").
- If a NOC/service is included in the deal → no extra charge. If not → extra amount
  added on top of deal price.

### 3.4 Saleable Assets
Sales cover four asset types:
1. **Land** (whole, standalone)
2. **Subdivided land** (individual plots)
3. **Project units** (sell units individually)
4. **Whole project** (sell the entire building/project to one buyer)

### 3.5 Sale Completion Lifecycle — NEW GAP
Sale is NOT complete until registry. The lifecycle is:

```
Sale Order (advance + payment plan)
   ↓
Agreement to Sell  OR  BBA (Builder Buyer Agreement)   ← optional middle step
   ↓
Registry (absolute final)                                ← sale complete
```

- **BBA / Agreement to Sell** protects the buyer during long payment plans (e.g.
  2-year plan — buyer needs a signed document before final registry).
- Both BBA and Agreement to Sell are optional (sometimes registry happens directly).
- **Until registry, the sale is not "complete"** — only "booked".
- Each stage has its own **document upload** (PDF/JPG/any format).
- Sale completion requires the registry document to be uploaded — only then does
  status flip to "Sold/Complete".

> **GAP**: Current `AssetSale` is a one-shot transaction. Need intermediate
> `saleStatus` (BOOKED → BBA_SIGNED → REGISTERED → COMPLETE) + document uploads
> per stage.

### 3.6 Purchase-Side Mirror
Same lifecycle applies to **purchases** (especially land):
- Purchase Order (book with advance, payment plan over years)
- Agreement to Sell / BBA (optional middle)
- Registry (final — purchase complete)
- **Partial payment registry** option — registry can happen before full payment
  (owner explicitly wants this flexibility).
- Until registry, purchase is not "complete".

---

## 4. Documents & File Uploads (Alpha Road 4.txt)

### 4.1 Universal Document Trail
- **Every** executed document must be uploadable and stored against its transaction:
  - Registry documents (sale + purchase)
  - NOCs / legal licenses
  - BBA / Agreement to Sell
  - Cheque photos
- Formats: PDF, JPG, any common format.
- A transaction is not considered final until its document is uploaded.
- **GAP**: Generic document-attachment infrastructure (polymorphic, attached to any
  entity). Currently only specific uploads exist (quote PDFs, cheque images).

---

## 5. HR & Field Workforce (Alpha Road 5.txt)

### 5.1 GPS-Tagged Attendance — No Hardware
- Attendance marked from the **employee's own phone** (the app) — no NFC tags, no
  biometric hardware.
- Geofence: each employee is enrolled with a **reporting location** (e.g.
  "Sikandrabad office"). When the employee reaches that geofence, their
  check-in auto-stamps time + GPS coordinates.
- **Field staff**: can mark attendance from any location via the app (with GPS
  coords), which then goes to their senior for approval (was the field visit
  legitimate?).

### 5.2 Three-Tier Attendance Status (Traffic Light)
| Color | Meaning |
|---|---|
| 🔴 Red | **Absent** — not at reporting location, no field approval |
| 🟡 Yellow | **Present but no work** — at location, but DPR not submitted/approved |
| 🟢 Green | **Present** — at location AND DPR approved by manager |

- The manager must approve the DPR for the day to flip yellow → green.
- Catches "office time-pass" employees who show up but do nothing.

### 5.3 Daily Progress Report (DPR)
- Submitted by employee from phone: what work done, how many people, materials used.
- Auto-pulls check-in/check-out times from that day's attendance.
- Routes to senior (supervisor/manager) for approval.
- Until approved, attendance stays yellow.
- Includes: % project complete, ETA to completion, labor count, material consumed.

### 5.4 HR Hierarchy
- **4 tiers**: Management → Manager → Supervisor → Labor
- Plus parallel roles (Accountant, Engineer) that sit at manager level but have
  different responsibilities — NOT on the same hierarchy line as managers.
- **Customizable hierarchy**: owner wants H1–H6 levels he can assign any role to
  (e.g. Accountant at H2, Engineer at H3, Labor at H5).
- **Team creation**: only a senior creates their juniors' accounts (owner can do
  all). Self-sign-up not allowed.

### 5.5 Attendance Types & Salary
- **5 attendance codes**:
  - `P` — Present
  - `H` — Half day
  - `Late` — late arrival (separate from half day)
  - `PL` — Paid Leave
  - `NPL` — Non-Paid Leave (salary deducted)
- **4 lates = 1 half-day cut** (automatic).
- **Half-day definition**: if employee is present < 85% of working hours → half day.
  Between 85–100% → late. (Working hours example: 10 hrs/day.)
- Paid leave count is **per-employee** (set at enrollment: some get 4, some get 2).
- **Auto salary calculation** from attendance at month-end.
- **PF (Provident Fund)**: optional, not mandatory.
- **Health insurance**: optional field, not mandatory.

> **Status**: GPS attendance fields exist on `WorkerAttendance`. GAPs: (a) 3-tier
> traffic-light status, (b) DPR↔attendance linkage for yellow→green, (c) 5-code
> attendance + late→half-day rule, (d) auto-salary from attendance, (e) H1–H6
> customizable hierarchy.

---

## 6. Rent / Lease & CRM (Amoria Cafe.txt)

### 6.1 Rent Module — NEW GAP (T14)
- Property given on rent → **registered rent agreement** uploaded to the system.
- Rent billing (monthly), **yearly increment** (configurable %).
- Tenant change: end old tenancy, start new tenant, new rent amount.
- Rent falls under **SAC** (services), not HSN, for GST.

### 6.2 CRM / Sales-Pipeline (BBA-style, like 4QT)
The owner references "4QT" software as the model for a sales CRM. Key features:
- **1000+ units** tracked across projects.
- **Sales hierarchy / milestones**:
  ```
  Unit Booked → BBA signed → 10% payment (1st slab) → 20% (4th slab) → 30% (10th slab) → ...
  ```
  Payments are **tied to construction slabs** (foundation → 4th floor → 10th floor).
- **Auto email intimations** when a payment threshold is due (integrated with email).
- **Brokerage tracking**: how much brokerage paid to which broker, how much pending,
  how much received.
- **CRM dashboard**: units remaining, units sold, whose BBA is pending, whose
  payment is pending — sales-only view (separate from inventory/operations).

> **GAP**: This is a major new module — a sales CRM with slab-based payment
> milestones tied to construction progress, broker management, and automated
> payment-due notifications. Partially overlaps with T06 (sales) and T14 (rent).

---

## 7. BOQ (Bill of Quantities) — Optional

- Per-project BOQ: engineer estimates "this building will cost ₹40 lakh" before
  construction starts.
- **Optional, not mandatory** — 90% of small builders don't make BOQs, but large
  planned companies (₹100 crore+ projects) always do.
- Should be available as an option per project, project-wise.
- Ties into procurement planning (BOQ → expected material requirements).

> **Status**: Not yet built. Low priority vs. HR/Sales-CRM/Rent but should be on
> the roadmap.

---

## 8. Cross-Cutting Themes

1. **Company scoping**: everything (land, project, inventory, HR) is linked to a
   company. Switching company in the world rail filters all data. Already
   implemented.
2. **Document-driven**: real estate is a document business — every stage (purchase,
   sale, NOC, registry, BBA) needs file uploads. A generic attachment system would
   unblock many of the GAPs above.
3. **Percentage-based costs with manual override**: land costs, registration, stamp
   duty, GST — all percentage-driven but never fixed. Always allow manual entry.
4. **Approval gates**: quotations → PO, DPR → attendance-green, BBA → registry.
   The app should enforce these sequences, not let users skip ahead.
5. **Mobile-first for field**: attendance, DPR, cheque photos, location — all from
   the phone. The mobile app is the primary interface for field staff.
6. **Printable outputs**: sales order receipt, payment receipts — printable forms
   the owner hands to the counterparty.

---

## 9. Gap Summary (for wayfinder backlog)

| # | Gap | Module | Priority |
|---|---|---|---|
| G1 | Land type (Freehold/Leasehold) | Land | High |
| G2 | Land cost breakup (lease rent, GST, reg, stamp %) | Land | High |
| G3 | Per-plot valuation + asking price at partition | Land | High |
| G4 | Owner-only subdivision undo | Land | Medium |
| G5 | Possession flag on Land + Project | Land/Project | Medium |
| G6 | Permissions/NOC sub-module | Land/Project | High |
| G7 | Sale lifecycle (Booked→BBA→Registry→Complete) + docs | Sales | High |
| G8 | Purchase lifecycle mirror (PO→BBA→Registry) | Procurement | Medium |
| G9 | T&C cost-allocation toggle (client/seller) | Sales | High |
| G10 | Broker + commission tracking on sales | Sales | Medium |
| G11 | Cheque photo + bank + payment mode on sales | Sales | Medium |
| G12 | Generic document-attachment infrastructure | Platform | High |
| G13 | Rent module (agreement, billing, yearly increment) | Rent | High |
| G14 | Sales CRM (slab-based payments, broker mgmt, auto-email) | CRM | High |
| G15 | 3-tier traffic-light attendance | HR | High |
| G16 | DPR↔attendance linkage (yellow→green) | HR | High |
| G17 | 5-code attendance + late→half-day rule | HR | Medium |
| G18 | Auto-salary from attendance | HR | Medium |
| G19 | H1–H6 customizable HR hierarchy | HR | Medium |
| G20 | BOQ per project (optional) | Project | Low |
| G21 | HSN/SAC auto-fetch from GST portal | Materials | Low |
| G22 | Standard cost "pull from previous purchase" | Materials | Low |
| G23 | Comparative Analysis UX on mobile PO form | Procurement | Medium |

---

*Last updated from transcripts: Alpha Road 1–5 + Amoria Cafe. These notes are the
authoritative voice-of-customer reference for prioritising the wayfinder backlog.*
