# SRG REALCON — Team Workflows & India Business Context

> **Purpose**: Maps all 7 seeded team members to their real-world daily workflows,
> cross-role handoff chains, and India-specific business/regulatory context.
> Use this as the ground-truth reference when refining any page or button —
> every workflow below should function end-to-end in the app.
>
> **Sources**: Seed script (`apps/web/scripts/create-srg-users.mjs`), RBAC matrix
> (`apps/web/src/lib/roles.ts`), owner transcripts
> (`docs/source-material/USER_SESSION_BUSINESS_LOGIC.md`), and India-specific
> business research (RERA, GST, TDS, land records, construction billing — see
> "Research Sources" at the bottom).

---

## Table of Contents

1. [Company Profile & Hierarchy](#1-company-profile--hierarchy)
2. [India Business Context — The Regulatory Backbone](#2-india-business-context--the-regulatory-backbone)
3. [The 7 Team Members — Role-by-Role Workflows](#3-the-7-team-members--role-by-role-workflows)
   - 3.1 [Vardaan Kumar — OWNER (H1)](#31-vardaan-kumar--owner-h1)
   - 3.2 [Sanjeev Kumar — ADMIN (H1)](#32-sanjeev-kumar--admin-h1)
   - 3.3 [Anurag Garg — PROJECT_DIRECTOR (H2)](#33-anurag-garg--project_director-h2)
   - 3.4 [Manish Kumar — FINANCE_HEAD (H3)](#34-manish-kumar--finance_head-h3)
   - 3.5 [Raviraj Singh — PROCUREMENT_MANAGER (H3)](#35-raviraj-singh--procurement_manager-h3)
   - 3.6 [Mani Singh — SALES_MANAGER (H4)](#36-mani-singh--sales_manager-h4)
   - 3.7 [Yash Saxena — SITE_ENGINEER (H4)](#37-yash-saxena--site_engineer-h4)
4. [Cross-Role Workflow Chains (End-to-End)](#4-cross-role-workflow-chains-end-to-end)
5. [Role → Module Permission Matrix](#5-role--module-permission-matrix)
6. [Research Sources](#6-research-sources)

---

## 1. Company Profile & Hierarchy

**Company**: SRG REALCON
**Business type**: Real Estate Development (land acquisition → construction → sales/rent)
**Currency**: INR
**Country context**: India (RERA, GST, TDS, Indian land records)

### Organizational Hierarchy

```
H1  Vardaan Kumar   OWNER              7017988293  reportsTo: nobody
H1  Sanjeev Kumar   ADMIN              9412230391  reportsTo: nobody
H2  Anurag Garg     PROJECT_DIRECTOR   7302920202  reportsTo: Vardaan
H3  Manish Kumar    FINANCE_HEAD        7302920201  reportsTo: Vardaan
H3  Raviraj Singh   PROCUREMENT_MANAGER 9520002752  reportsTo: Vardaan
H4  Mani Singh      SALES_MANAGER       7302920203  reportsTo: Manish
H4  Yash Saxena     SITE_ENGINEER       7302920205  reportsTo: Anurag
```

### Reporting Lines (Visual)

```
                    Vardaan (OWNER)         Sanjeev (ADMIN)
                   ┌──────┴──────┐               │
            Anurag (PD)    Manish (FH)    Raviraj (PM)
               │               │               │
          Yash (SE)       Mani (SM)
```

- **Vardaan** owns the business — final financial + strategic approvals.
- **Sanjeev** is the system administrator — platform config, user management, integrations.
- **Anurag** runs construction — projects, BOQ, WBS, MB, subcontractors, DPR approval.
- **Manish** runs finance — payments, payroll, GL, tax compliance, RA payments.
- **Raviraj** runs procurement — suppliers, quotations, POs, goods receipt, inventory.
- **Mani** runs sales — CRM, leads, tele-calling, sale lifecycle, brokers, portal listings.
- **Yash** runs the site — DPRs, attendance, material issues, MB entries, safety.

---

## 2. India Business Context — The Regulatory Backbone

> Before mapping individual workflows, here is the India-specific regulatory and
> business context that shapes every workflow in this app. These are not optional
> features — they are legal requirements for an Indian real estate developer.

### 2.1 RERA (Real Estate Regulation and Development Act, 2016)

**What it is**: The central law governing real estate development in India. Every
residential/commercial project above a threshold (8+ units or 500+ sqm carpet area)
must be registered with the state RERA authority before any marketing or sale.

**Key rules that affect SRG REALCON's workflows**:

| Rule                                     | Impact on Workflow                                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project registration** (Section 3)     | Cannot advertise, market, or sell until RERA registration is granted (30-day approval window). Project must have RERA number.                                                |
| **10% advance cap** (Section 13)         | Cannot collect more than 10% of property cost as booking advance before executing + registering the Builder-Buyer Agreement (BBA).                                           |
| **BBA mandatory**                        | The Agreement for Sale (BBA) must be executed and registered at the Sub-Registrar's office before collecting beyond 10%.                                                     |
| **70% escrow rule** (Section 4(2)(l)(D)) | 70% of all customer collections must go into a designated project escrow account. Withdrawals require certification by engineer + architect + CA. Only 30% is freely usable. |
| **Withdrawal certification**             | Every escrow withdrawal must be certified by an engineer, architect, and chartered accountant — tied to construction progress.                                               |
| **Quarterly Progress Reports (QPR)**     | Developer must file QPRs with the RERA authority showing construction progress.                                                                                              |
| **Possession date**                      | BBA must specify a definite possession date with a narrow grace period. Delay penalties: SBI MCLR + 2% (both buyer and developer).                                           |
| **Defect liability**                     | Developer liable for structural defects for 5 years after possession.                                                                                                        |
| **Conveyance (Sale Deed)**               | Final sale deed transfers title — executed at possession after full payment.                                                                                                 |

**App modules affected**: Sales (lifecycle stages), Finance (escrow tracking), Projects
(RERA number, QPR), Legal/NOC (RERA registration documents).

### 2.2 GST (Goods and Services Tax) for Real Estate

**What it is**: GST applies to under-construction property sales (before Completion
Certificate / Occupancy Certificate is issued). After CC/OC, the property becomes
immovable property and GST no longer applies.

**GST rates for real estate (2026)**:

| Property Type                     | GST Rate     | ITC Available?                 |
| --------------------------------- | ------------ | ------------------------------ |
| Affordable residential (RREP)     | 1% (0.5+0.5) | No                             |
| Non-affordable residential (RREP) | 5% (2.5+2.5) | No                             |
| Commercial in RREP                | 5%           | No                             |
| Commercial (non-RREP)             | 12%          | Yes (subject to Section 17(5)) |
| Ready-to-move (after CC/OC)       | 0% (no GST)  | N/A                            |

**80:20 procurement rule**: Developers must procure at least 80% of construction
goods from registered suppliers. If they buy from unregistered suppliers, reverse
charge applies at 18% on those inputs.

**HSN/SAC codes**: Materials use HSN (Harmonized System Nomenclature), services use
SAC (Service Accounting Code). The government maintains these classifications —
the app's HSN auto-fetch feature pulls from the CBIC portal.

**App modules affected**: Materials (HSN codes, GST rates), Sales (GST on sale
price), Procurement (supplier GST registration, input tax credit), Finance (GST
return filing, reverse charge).

### 2.3 TDS (Tax Deducted at Source)

**Two critical TDS sections for real estate**:

| Section   | Who Deducts                                       | Rate                                   | Threshold                                | What It Covers                                                       |
| --------- | ------------------------------------------------- | -------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| **194C**  | Developer (SRG) paying contractors/subcontractors | 1% (individual/HUF), 2% (company/firm) | ₹30,000 single payment, ₹1,00,000 annual | Civil work, finishing, labour supply, site security, transport       |
| **194IA** | Buyer purchasing property                         | 1%                                     | ₹50,00,000 (50 lakh)                     | Property sale consideration — buyer deducts and remits via Form 26QB |

**Impact**: When SRG pays subcontractors (Anurag approves RA bill → Manish pays),
Manish must deduct TDS under 194C. When a buyer pays SRG for a unit above ₹50L,
the buyer deducts 1% TDS under 194IA — SRG receives payment net of TDS.

**App modules affected**: Work Orders (RA bill TDS deduction), Supplier Payments
(TDS on contractor payments), Finance (TDS compliance, Form 26QB tracking).

### 2.4 Land Records & Due Diligence (India-Specific)

India uses a **presumptive title system** — land records are evidence of ownership,
not state-guaranteed title. Due diligence requires multiple documents:

| Document                         | What It Shows                                        | State Variations                         |
| -------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| **7/12 Extract** (Satbara)       | Ownership + crop details                             | Maharashtra, Gujarat                     |
| **RTC / Pahani**                 | Record of Rights + Tenancy + Crops                   | Karnataka                                |
| **Jamabandi**                    | Record of Rights                                     | North India (Punjab, Haryana, Rajasthan) |
| **Patta / Chitta**               | Land ownership + classification                      | Tamil Nadu                               |
| **Khata / e-Khata**              | Property tax account                                 | Karnataka                                |
| **Khasra / Khewat**              | Parcel + ownership account                           | North India                              |
| **Encumbrance Certificate (EC)** | Mortgages, liens, charges (min 13 years, ideally 30) | All states (Sub-Registrar)               |
| **Mother Deed**                  | Original ownership chain (30+ years)                 | All states                               |
| **CERSAI**                       | Registered charges/mortgages against property        | Central registry                         |
| **Mutation entry**               | Transfer of ownership in revenue records             | All states                               |

**Freehold vs Leasehold**:

- **Freehold**: Permanent ownership (e.g., 500 years). Ours forever.
- **Leasehold**: Leased from an authority (government/development authority) for
  90–100 years. We are "owners" but revert after lease term. Requires NOC from
  lessor for transfer. Must verify remaining tenure (70+ years for loan eligibility).

**App modules affected**: Land (land type, cost breakup, purchase lifecycle,
legal documents, partition, valuation), Legal/NOC tab.

### 2.5 Construction Billing Chain (India-Specific)

The Indian construction billing chain follows a strict document sequence:

```
BOQ (scope) → Work Execution → Measurement Book (MB) → Quantity Certification
→ RA Bill (payment claim) → Deductions (retention + TDS + advance) → Approval → Payment
```

**Measurement Book (MB)**:

- Records actual site measurements (length × breadth × depth) per BOQ item
- Must include location reference (wing, floor, grid, chainage)
- Follows IS Code 1200 (Method of Measurement)
- Engineer records, client/PMC verifies via joint measurement
- Without MB entry, work "doesn't exist" for billing purposes

**RA Bill (Running Account Bill)**:

- Periodic (usually monthly) payment claim by contractor/subcontractor
- Cumulative — covers all work from project start, not just current month
- Deductions: retention (typically 5–10%), TDS (1%/2% under 194C), advance recovery
- Must be certified by engineer/architect before payment
- Retention released after defect liability period (typically 1 year)

**App modules affected**: BOQ, Measurement Book, Work Orders (RA bills),
Subcontractors, Finance (RA payment).

### 2.6 Sale Lifecycle (India — RERA Compliant)

The full sale lifecycle for an Indian real estate unit:

```
Lead → Site Visit → EOI (Expression of Interest) → Booking (token + allotment letter)
→ BBA Registration (within 10% cap) → Construction-Linked Payments (CLP milestones)
→ Completion Certificate (CC) / Occupancy Certificate (OC) → Sale Deed Registration
→ Possession → Defect Liability Period (5 years)
```

**Construction-Linked Payment (CLP) milestones** (typical for a G+12 tower):

| Milestone                            | % of Total Price                   |
| ------------------------------------ | ---------------------------------- |
| Booking                              | 10% (max — BBA must be registered) |
| Foundation                           | 10%                                |
| 1st Slab                             | 7.5%                               |
| 4th Slab                             | 7.5%                               |
| 7th Slab                             | 7.5%                               |
| 10th Slab                            | 7.5%                               |
| Superstructure complete              | 10%                                |
| Brickwork + plastering               | 10%                                |
| MEP (mechanical/electrical/plumbing) | 10%                                |
| Finishing                            | 10%                                |
| Possession                           | 10%                                |

Each milestone payment is triggered by a **demand letter** from the developer,
verified by the buyer's bank's technical officer before loan disbursement.

**App modules affected**: Sales (lifecycle stages, payment schedule), CRM (lead
→ booking), Finance (payment collection, escrow), WBS (milestone tracking →
auto demand notices).

### 2.7 Attendance & Payroll (India-Specific)

Indian construction sites use a **5-code attendance system**:

| Code     | Meaning            | Pay Impact                       |
| -------- | ------------------ | -------------------------------- |
| **P**    | Present (full day) | Full pay                         |
| **H**    | Half-day           | Half pay                         |
| **Late** | Late arrival       | 4 lates = 1 half-day deduction   |
| **PL**   | Paid Leave         | Full pay (from leave balance)    |
| **NPL**  | No Paid Leave      | No pay (leave balance exhausted) |

**85% rule**: If a worker is present for 85% or more of a half-day's hours, it
counts as a half-day (not absent).

**Traffic-light tier system** (SRG's model):

- 🟢 **Green**: Present + DPR approved by manager
- 🟡 **Yellow**: Present but DPR not yet approved (pending)
- 🔴 **Red**: Absent (no check-in)

**Payroll cycle**: Monthly. Auto-calculated from attendance at month-end.
Late deductions applied (4 lates = 1 half-day). Generated via `generatePayroll()`.

**App modules affected**: HR (attendance, DPR, payroll), Finance (payroll
disbursement).

---

## 3. The 7 Team Members — Role-by-Role Workflows

### 3.1 Vardaan Kumar — OWNER (H1)

**Role**: OWNER | **Tier**: 1 (Executive) | **Department**: Management
**Permissions**: `*` (all 90+ permissions — full access)
**Reports to**: Nobody (top of hierarchy)
**Phone**: +91 70179 88293

#### Daily Rhythm

| Time     | Workflow                                                                                                                                                  | Modules              | App Pages                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| 8:00 AM  | **Command Center** — review pending approvals queue (POs, requisitions, expenses, gate passes, RAs), low-stock alerts, overdue POs, active sales pipeline | Dashboard            | `/` (Command Center)                                    |
| 8:30 AM  | **Financial cockpit** — cash position, project P&L, trial balance, material inventory value, profit-center overview                                       | Finance, GL, Reports | `/finance`, `/gl`, `/reports`, `/profit-center`         |
| 9:00 AM  | **Approve purchase orders** — final approval gate before procurement commits money (high-value POs)                                                       | Procurement          | `/purchase-orders`, `/approvals`                        |
| 10:00 AM | **Approve expenses** — expense claims, petty cash, recurring expenses                                                                                     | Expenses             | `/expenses`, `/expense-claims`, `/petty-cash`           |
| 11:00 AM | **Approve RA bills** — final payment authorization for subcontractor running accounts                                                                     | Subcontractors       | `/work-orders`, `/subcontractors`                       |
| 2:00 PM  | **Review project cost control** — budget variance, EVM, BOQ vs actual, project P&L per project                                                            | Project Control      | `/budget-variance`, `/project-control`, `/cost-control` |
| 4:00 PM  | **Review sales pipeline** — active deals, revenue forecast, broker commissions, sale lifecycle stages                                                     | Sales                | `/sales`, `/crm`, `/brokers`                            |
| 5:00 PM  | **Land & asset review** — land portfolio, partition decisions, valuation, asking prices                                                                   | Land                 | `/land`, `/real-estate-inventory`                       |

#### Strategic Workflows (India-Specific)

1. **Land Acquisition Decision**
   - Review land cost breakup: base cost + lease rent (one-time OR yearly) + GST + registration charges + stamp duty
   - All add-ons are percentage-based with manual override
   - Decide: Freehold vs Leasehold (verify remaining tenure if leasehold — 70+ years for loan eligibility)
   - Verify: 7/12 extract, EC (30 years), Mother Deed chain, CERSAI (no mortgages), mutation entries
   - Approve purchase → land enters purchase lifecycle: BOOKED → BBA_SIGNED → REGISTERED → COMPLETED
   - **App**: `/land` (land wizard + cost breakup + purchase lifecycle + legal docs)

2. **Land Partition Approval**
   - Decide how to subdivide a parcel (e.g., 1000 sq yards → plots of 100, 200, 300, 400)
   - Set per-plot: plot number, area, valuation (estimated value), asking price
   - On confirmation: parent land → PARTITIONED, child plots created as saleable inventory
   - **Exclusive permission**: Only Vardaan (OWNER) can undo a partition (un-partition)
   - **App**: `/land` → partition dialog + unpartition button

3. **Project Sanction**
   - Approve a new project on an un-partitioned land parcel
   - Set project budget, assign Project Director (Anurag) and Site Engineers (Yash)
   - Obtain RERA registration (mandatory before any marketing/sale)
   - Obtain NOCs: map sanction, fire NOC, airport authority NOC, environmental clearance
   - **App**: `/projects` (create project) + `/land` (legal/NOC tab)

4. **Sale Finalization Review**
   - Review high-value unit sales before final approval
   - Verify: BBA registered (within 10% advance cap), sale deed registered, payment complete
   - Verify: 70% escrow compliance — collections went to designated account
   - Verify: buyer deducted 1% TDS under 194IA (if sale > ₹50L)
   - **App**: `/sales` (sale detail + lifecycle timeline + document uploads)

5. **User & Team Management**
   - Create/edit any user, assign any role (only OWNER/ADMIN can do this)
   - Set H1–H6 hierarchy levels
   - Activate/deactivate accounts
   - Configure custom roles with permission overrides
   - **App**: `/settings` → Team, `/permissions`

6. **Company Settings & Integrations**
   - Configure chart of accounts, tax rates, HSN/SAC codes
   - Set up integrations: Tally sync, WhatsApp, email, portals
   - Configure telephony (Twilio/Exotel)
   - **App**: `/settings`, `/telephony`

#### Approval Gates Vardaan Owns (Final Tier)

| Approval Type                 | Permission Key        | Module      |
| ----------------------------- | --------------------- | ----------- |
| Purchase Order (all amounts)  | `po.approve`          | Procurement |
| Requisition (final)           | `requisition.approve` | Procurement |
| Expense (all amounts)         | `expense.approve`     | Finance     |
| RA Payment (final)            | `ra.pay`              | Work Orders |
| Gate Pass (high-value)        | `gate_pass.approve`   | Gate Pass   |
| DPR Admin Approval (final)    | `dpr.approve_admin`   | HR          |
| Land Un-Partition (exclusive) | `land.partition`      | Land        |

---

### 3.2 Sanjeev Kumar — ADMIN (H1)

**Role**: ADMIN | **Tier**: 1 (Executive) | **Department**: Management
**Permissions**: `*` (all 90+ permissions — same as OWNER)
**Reports to**: Nobody (co-admin, peer to Vardaan)
**Phone**: +91 94122 30391

#### Daily Rhythm

Sanjeev mirrors Vardaan's access but in practice acts as the **system
administrator / operations co-pilot**. While Vardaan focuses on business strategy
and financial approvals, Sanjeev focuses on platform health, configuration, and
user management.

| Workflow                  | Description                                                                                                                     | Modules           | App Pages                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| **System configuration**  | Manage company settings, chart of accounts, tax rates, HSN/SAC codes, integrations (Tally sync, WhatsApp, email, portals)       | Settings, GL      | `/settings`, `/gl`                |
| **User management**       | Create/edit users, assign roles (can assign any role except self-cloning), manage H1–H6 hierarchy, activate/deactivate accounts | Settings → Team   | `/settings`, `/permissions`       |
| **Workflow builder**      | Create and manage approval workflows, canvas diagrams, task templates                                                           | Workflows, Canvas | `/workflows`, `/m/workflows`      |
| **Audit log review**      | Review all audit logs (before/after payloads) for compliance and troubleshooting                                                | Audit             | `/settings` → Audit               |
| **Telephony management**  | Configure Twilio/Exotel integration, manage company phone numbers, call routing                                                 | Telephony         | `/telephony`, `/calls`            |
| **Backup management**     | Monitor automated backups (daily 2am UTC cron), trigger manual backup, review backup health                                     | API/cron          | `/api/cron/backup`, `/api/health` |
| **Approval backup**       | Acts as second approver when Vardaan is unavailable — can approve POs, expenses, RAs, gate passes                               | Approvals         | `/approvals`                      |
| **Permission management** | Configure custom roles, adjust permission overrides per role                                                                    | Permissions       | `/permissions`                    |

#### Key Difference from OWNER

Both have `*` permissions, but in the real-world hierarchy:

- **Vardaan** = business owner → makes strategic decisions, final financial approvals
- **Sanjeev** = system administrator → keeps the platform running, manages
  configuration, handles technical operations, acts as backup approver

Sanjeev's day-to-day focus: **system health, configuration, user management,
integrations, audit compliance**.

---

### 3.3 Anurag Garg — PROJECT_DIRECTOR (H2)

**Role**: PROJECT_DIRECTOR | **Tier**: 2 (Senior Management) | **Department**: Construction
**Reports to**: Vardaan (OWNER)
**Phone**: +91 73029 20202

#### Permissions Summary

50+ permissions across: projects (view+manage), procurement (view+manage, PO
approve, requisition approve), inventory (view), BOQ (view+manage), WBS
(view+manage), MB (view+verify+approve), project control (view), finance (view),
HR (view, DPR view, DPR admin approve), subcontractors (WO manage, RA approve),
vehicles (view), gate passes (view+create+approve+manage), legal (manage), calls
(view all + full number + create + edit + recording + analytics), telephony (view),
safety (view+manage), audit (view).

#### Daily Rhythm

| Time     | Workflow                                                                                                                 | Modules                   | App Pages                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ----------------------------------- |
| 7:30 AM  | **Review all projects** — project status dashboard, cost vs budget, schedule variance, EVM metrics                       | Projects, Project Control | `/projects`, `/project-control`     |
| 8:00 AM  | **Review DPRs from site engineers** — approve/reject Daily Progress Reports from Yash and other site staff               | HR → DPRs                 | `/hr/dprs`, `/m/dprs`               |
| 8:30 AM  | **Approve material requisitions** from sites — site engineers request materials, Anurag approves before procurement acts | Requisitions              | `/requisitions`, `/approvals`       |
| 9:00 AM  | **Approve purchase orders** — mid-tier PO approval (before Vardaan's final approval for high-value)                      | Procurement               | `/purchase-orders`, `/approvals`    |
| 10:00 AM | **Approve work orders** to subcontractors — issue work orders, track scope                                               | Work Orders               | `/work-orders`                      |
| 11:00 AM | **Measurement Book verification** — verify MB entries from Yash (work executed), approve for RA billing                  | Measurement Book          | `/measurement-book`                 |
| 12:00 PM | **Approve RA bills** from subcontractors — approve running account bills before they go to Manish for payment            | Subcontractors            | `/work-orders`, `/subcontractors`   |
| 2:00 PM  | **BOQ management** — review bill of quantities, approve engineer estimates pre-construction                              | BOQ                       | `/boq`                              |
| 3:00 PM  | **WBS management** — review/update work breakdown structure, track construction progress per node                        | WBS                       | `/wbs`                              |
| 4:00 PM  | **Cost control review** — budget variance, EVM, cost performance index per project                                       | Budget Variance           | `/budget-variance`, `/cost-control` |
| 5:00 PM  | **Safety oversight** — review safety incidents, hazards, inspections across all sites                                    | Safety                    | `/safety`, `/m/safety`              |
| 5:30 PM  | **Gate pass approval** — approve material gate passes for outbound movement                                              | Gate Passes               | `/gate-passes`, `/approvals`        |

#### Real-World Construction Workflows (India-Specific)

1. **Project Planning & BOQ Creation**
   - Create BOQ from engineer estimates (pre-construction cost estimation)
   - Build WBS (Work Breakdown Structure) — construction phases, activities, nodes
   - Set project budget per BOQ item
   - Assign site engineers (Yash) to project
   - Obtain RERA registration + NOCs (map sanction, fire, airport, environmental)
   - **App**: `/boq` + `/wbs` + `/projects` + `/land` (legal tab)

2. **Material Requisition → Procurement Handoff**
   - Yash (site engineer) raises a material requisition (material, qty, project, justification)
   - Anurag reviews and approves (REQUISITION_APPROVE)
   - Approved requisition goes to Raviraj (procurement) for sourcing
   - **App**: `/requisitions` → approve → routes to `/procurement`

3. **Subcontractor Management & RA Billing**
   - Issue work orders to subcontractors (scope, rate, BOQ items)
   - Yash records MB entries (work executed — L×B×D per IS 1200)
   - Anurag verifies MB entries (MB_VERIFY) → joint measurement
   - Anurag approves MB entries (MB_APPROVE)
   - RA bill auto-generated from approved MB entries at BOQ rates
   - Anurag approves RA bill (RA_APPROVE) — with deductions: retention (5–10%), TDS (1%/2% under 194C)
   - Approved RA bill goes to Manish for payment (RA_PAY)
   - **App**: `/work-orders` → `/measurement-book` → RA bill → approve → `/finance`

4. **Cost Control & EVM**
   - Monitor budget variance (BOQ budget vs actual cost)
   - Track EVM: CPI (Cost Performance Index), SPI (Schedule Performance Index)
   - Identify cost overruns early — while there's still time to act
   - **App**: `/budget-variance`, `/project-control`, `/cost-control`

5. **DPR Admin Approval (Attendance Tier Gate)**
   - Yash submits DPR daily (work done, labor lines, materials, photos)
   - Anurag reviews → approves (DPR_APPROVE_ADMIN) or rejects
   - Attendance tier: 🟡 (present, DPR pending) → 🟢 (present, DPR approved)
   - If rejected → tier stays 🟡 → Yash resubmits
   - This gate ensures attendance is validated by actual work evidence
   - **App**: `/hr/dprs` → approve → attendance tier updates

6. **Task Assignment**
   - Assign tasks to site engineers (Yash), supervisors
   - Track task completion, add notes
   - **App**: `/tasks`, `/my-tasks`

7. **Call Tracking & Site Coordination**
   - View all calls (CALL_VIEW_ALL) — site coordination calls
   - Listen to recordings, review analytics
   - **App**: `/calls`

#### Handoffs

- **Receives from**: Yash (DPRs → approval, requisitions → approval, MB entries →
  verification, gate passes → approval, safety reports → review)
- **Sends to**: Raviraj (approved requisitions → procurement), Manish (approved RA
  bills → payment), Vardaan (high-value POs → final approval)

---

### 3.4 Manish Kumar — FINANCE_HEAD (H3)

**Role**: FINANCE_HEAD | **Tier**: 2 (Senior Management) | **Department**: Finance
**Reports to**: Vardaan (OWNER)
**Phone**: +91 73029 20201

#### Permissions Summary

Finance (view+manage), expense create+approve, projects (view), procurement
(view), quotations (view), sales (view), assets (view, rentals view), BOQ/WBS/MB
(view), project control (view), HR (view, payroll view+manage, DPR view), RA
approve+pay, vehicles (view), users (view), gate pass (view+approve), legal
(manage), calls (view+analytics).

#### Daily Rhythm

| Time     | Workflow                                                                                                      | Modules                                  | App Pages                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| 8:00 AM  | **Cash position review** — bank balances, petty cash, receivables, payables, cash flow forecast               | Finance, GL, Petty Cash                  | `/finance`, `/gl`, `/petty-cash`                  |
| 8:30 AM  | **Pending payments queue** — supplier payments, subcontractor RA payments, expense reimbursements, payroll    | Supplier Payments, Work Orders, Expenses | `/supplier-payments`, `/work-orders`, `/expenses` |
| 9:00 AM  | **Process supplier payments** — pay approved POs/invoices, record cheque/RTGS/NEFT, upload cheque photos      | Supplier Payments                        | `/supplier-payments`                              |
| 10:00 AM | **Approve expenses** — expense claims, petty cash requests, recurring expenses                                | Expenses                                 | `/expenses`, `/expense-claims`, `/petty-cash`     |
| 11:00 AM | **Process RA payments** — pay approved subcontractor RA bills (RA_PAY), deduct TDS under 194C                 | Work Orders                              | `/work-orders`                                    |
| 2:00 PM  | **Sale payment recording** — record booking advances, CLP milestone payments from Mani (sales)                | Sales                                    | `/sales`                                          |
| 3:00 PM  | **Tax compliance** — GST returns, TDS filing, HSN/SAC reconciliation, supplier GST verification               | GL, Reports                              | `/gl`, `/reports`                                 |
| 4:00 PM  | **Cost allocation review** — project cost per sqft, unit production costs, reallocation after material issues | Profit Center, Cost Control              | `/profit-center`, `/cost-control`                 |

#### Weekly/Monthly Rhythms

| Cadence                | Workflow                                                                                                              | Modules              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Weekly**             | Vendor ledger reconciliation — reconcile supplier payments to bank statements                                         | Finance, GL          |
| **Monthly (1st week)** | **Payroll processing** — generate payroll from attendance (auto-salary calc), apply late/half-day deductions, approve | HR → Payroll         |
| **Monthly**            | **GL reconciliation** — trial balance, P&L, balance sheet, journal entries, bank reconciliation                       | GL, Finance, Reports |
| **Monthly**            | **GST return filing** — GSTR-1 (outward supplies), GSTR-3B (summary return), reconcile with sales/purchases           | GL, Reports          |
| **Monthly**            | **TDS compliance** — TDS deduction (194C on contractor payments), TDS return (Form 26Q), issue TDS certificates       | Finance, Work Orders |
| **Quarterly**          | **RERA QPR** — file Quarterly Progress Report with RERA authority (construction progress)                             | Projects, Reports    |
| **Quarterly**          | **RERA escrow reconciliation** — reconcile 70% escrow account, certify withdrawals (engineer + architect + CA)        | Finance, Projects    |

#### Real-World Finance Workflows (India-Specific)

1. **Procurement Payment Cycle**
   - Raviraj creates PO → Vardaan/Anurag approve → goods received (GRN) →
     supplier invoice verified → Manish processes payment
   - Record: payment mode (cheque/RTGS/NEFT/UPI), cheque number, bank, cheque photo
   - Deduct TDS under 194C if contractor payment > ₹30,000 single / ₹1,00,000 annual
   - **App**: `/supplier-payments`

2. **Subcontractor Payment Cycle**
   - Anurag approves RA bill → Manish pays (RA_PAY)
   - Deductions: retention (5–10%, released after defect liability), TDS (1%/2% under 194C), advance recovery
   - Record payment mode + cheque photo
   - **App**: `/work-orders` → RA bill → pay

3. **Payroll Cycle (Monthly)**
   - Attendance recorded daily (5-code: P/H/Late/PL/NPL)
   - DPR approval gates attendance tier (🟡 → 🟢)
   - At month-end: `generatePayroll()` auto-calculates salary from attendance
   - Late deductions: 4 lates = 1 half-day
   - 85% of half-day hours = half-day (not absent)
   - Manish approves payroll → disburses salary
   - **App**: `/hr/payroll`

4. **Sale Payment Collection**
   - Mani (sales) collects booking advance (max 10% — BBA must be registered)
   - CLP milestone payments: as Anurag updates WBS nodes (foundation, slab, etc.),
     demand notices auto-generate → Mani follows up → customer pays → Manish records
   - Record: payment mode, cheque photo, bank details
   - Track: 70% escrow deposit compliance, buyer TDS under 194IA (1% if > ₹50L)
   - **App**: `/sales` → payment recording + `/finance` → escrow tracking

5. **Expense Management**
   - Any employee creates expense claim → Manish approves → payment processed
   - Petty cash: track balance, approve expenses, reconcile
   - Recurring expenses: rent, salaries, utilities — auto-posted monthly
   - **App**: `/expenses`, `/expense-claims`, `/petty-cash`, `/recurring-expenses`

6. **Land Purchase Accounting**
   - Record land cost breakup: base + lease rent (one-time/yearly) + GST + registration + stamp duty
   - Track payment stages: BOOKED → BBA → REGISTERED → COMPLETED
   - **App**: `/land` → cost breakup + purchase lifecycle

7. **Legal & Compliance Management**
   - Manage legal documents (LEGAL_MANAGE permission)
   - Track legal cases, NOC compliance, RERA registration
   - **App**: `/land` → legal tab, `/projects` → legal tab

8. **GST Compliance (India-Specific)**
   - GSTR-1: outward supplies (sales invoices) — monthly
   - GSTR-3B: summary return — monthly
   - Track ITC (Input Tax Credit) on purchases — 80:20 rule (80% from registered suppliers)
   - Reverse charge on unregistered supplier purchases (18%)
   - GST on sale: 1% (affordable), 5% (non-affordable residential), 12% (commercial with ITC)
   - After CC/OC: no GST (property becomes immovable property)
   - **App**: `/gl`, `/reports`, `/finance`

9. **TDS Compliance (India-Specific)**
   - Section 194C: deduct 1% (individual/HUF) or 2% (company/firm) on contractor payments > ₹30K single / ₹1L annual
   - Section 194IA: buyer deducts 1% on property purchase > ₹50L (Form 26QB)
   - File TDS returns quarterly (Form 26Q for 194C)
   - Issue TDS certificates (Form 16A) to contractors
   - **App**: `/work-orders`, `/supplier-payments`, `/finance`

#### Handoffs

- **Receives from**: Raviraj (approved POs → payment), Anurag (approved RA bills →
  payment), Mani (sale payments → recording), all employees (expense claims →
  approval)
- **Sends to**: Vardaan (financial reports → review), external (supplier payments,
  subcontractor payments, payroll disbursement, tax payments to government)

---

### 3.5 Raviraj Singh — PROCUREMENT_MANAGER (H3)

**Role**: PROCUREMENT_MANAGER | **Tier**: 3 (Middle Management) | **Department**: Procurement
**Reports to**: Vardaan (OWNER)
**Phone**: +91 95200 02752

#### Permissions Summary

Projects (view), inventory (view+manage), procurement (view+manage, requisition
approve), quotations (view+manage), assets (view, rentals view), BOQ/WBS/MB
(view), project control (view), finance (view), vehicles (view+manage), tasks
(view), gate passes (view+create+approve+manage), calls (view+create+edit).

#### Daily Rhythm

| Time     | Workflow                                                                                                       | Modules                   | App Pages                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| 7:30 AM  | **Low-stock alerts** — review auto-generated requisitions from reorder-point triggers, plan procurement        | Inventory, Materials      | `/inventory`, `/materials`                                   |
| 8:00 AM  | **Requisition queue** — review approved requisitions from Anurag/site engineers, convert to procurement action | Requisitions              | `/requisitions`                                              |
| 8:30 AM  | **Quotation collection** — collect quotations from multiple suppliers for each material requirement            | Quotations                | `/quotations`, `/quotes`                                     |
| 9:00 AM  | **Comparative analysis** — side-by-side comparison of supplier quotes, flag cheapest, select winner            | Quotations → Comparative  | `/quotations` (comparative panel)                            |
| 10:00 AM | **Create purchase orders** — auto-fill PO from winning quote, send to supplier                                 | Purchase Orders           | `/purchase-orders`                                           |
| 11:00 AM | **Goods receipt** — record incoming materials (GRN), verify qty + quality, update stock + MAC                  | Goods Receipts            | `/goods-receipts`                                            |
| 12:00 PM | **Direct purchases** — record direct purchases (no PO for small items)                                         | Direct Purchases          | `/direct-purchases`                                          |
| 2:00 PM  | **Supplier management** — manage supplier database, track vendor ratings, rate contracts                       | Suppliers, Vendor Ratings | `/suppliers`, `/vendor-ratings`, `/rate-contracts`           |
| 3:00 PM  | **Inventory management** — monitor stock levels, stock movements, material reconciliation                      | Inventory, Stock          | `/inventory`, `/stock-movements`, `/material-reconciliation` |
| 4:00 PM  | **Supplier returns** — process returns for damaged/incorrect materials                                         | Supplier Returns          | `/supplier-returns`                                          |
| 5:00 PM  | **Gate pass management** — create/approve gate passes for material movement                                    | Gate Passes               | `/gate-passes`                                               |

#### Real-World Procurement Workflows (India-Specific)

1. **The Comparative Analysis Gate** (Owner's #1 Priority)
   - Site engineer (Yash) raises requisition → Anurag approves → Raviraj receives
   - Raviraj collects ≥3 quotations from different suppliers (rate + terms)
   - Comparative analysis screen: all suppliers side-by-side, cheapest flagged
   - Pick winner → PO auto-created with winning supplier + rate pre-filled
   - PO goes to Vardaan/Anurag for approval → sent to supplier
   - **App**: `/requisitions` → `/quotations` (comparative) → `/purchase-orders`

2. **Goods Receipt Cycle**
   - Supplier delivers materials → Raviraj (or storekeeper) creates GRN
   - Verify quantity + quality against PO
   - Stock updated via `recordMovement()` (immutable ledger + MAC calculation)
   - MAC formula: `newMAC = (oldQty×oldMAC + recvQty×recvCost) / (oldQty+recvQty)`
   - If damaged/short → supplier return
   - **App**: `/goods-receipts` → `/stock-movements` → `/supplier-returns`

3. **Rate Contract Management**
   - Negotiate rate contracts with suppliers for recurring materials (cement, steel, sand, aggregates)
   - Lock rates for a period (e.g., 3 months) → POs auto-use contracted rate
   - Monitor rate contract expiry, renegotiate
   - **App**: `/rate-contracts`

4. **Auto-Requisition (Reorder Point)**
   - System monitors stock levels against reorder points (set per material)
   - When stock drops below reorder → auto-generates requisition
   - Raviraj reviews → converts to quotation collection → PO
   - **App**: `/materials` (reorder point) → `/requisitions` (auto) → `/quotations` → `/purchase-orders`

5. **Material Cost Tracking (MAC)**
   - Every receipt updates Moving Average Cost per location
   - Raviraj monitors cost trends, identifies cost-saving opportunities
   - On issue: MAC is unchanged; issue's unitCost = current MAC
   - Transfers carry source MAC to destination
   - **App**: `/inventory` → MAC reports

6. **Supplier GST Verification (India-Specific)**
   - Verify supplier GST registration number (GSTIN)
   - Track whether supplier is registered (for ITC eligibility under 80:20 rule)
   - If buying from unregistered supplier → reverse charge at 18%
   - **App**: `/suppliers` → GST fields

7. **Vendor Rating System**
   - Rate suppliers on: delivery timeliness, quality, pricing, responsiveness
   - Use ratings in comparative analysis decision-making
   - **App**: `/vendor-ratings`

#### Handoffs

- **Receives from**: Anurag (approved requisitions), system (auto-requisitions from
  low stock), suppliers (quotations, deliveries)
- **Sends to**: Vardaan/Anurag (POs → approval), Manish (invoices → payment),
  site (materials → stock issue to Yash)

---

### 3.6 Mani Singh — SALES_MANAGER (H4)

**Role**: SALES_MANAGER | **Tier**: 4 (Execution) | **Department**: Sales
**Reports to**: Manish (FINANCE_HEAD) — _Sales reports to finance in this org:
Manish oversees sales revenue collection_
**Phone**: +91 73029 20203

#### Permissions Summary

Sales (view+manage+create), assets (view+manage+sell), rentals (view+manage),
projects (view), quotations (view+manage), tasks (view), gate passes
(view+create+manage), calls (view+full number+create+edit+recording
listen+analytics).

#### Daily Rhythm

| Time     | Workflow                                                                                                      | Modules           | App Pages                                |
| -------- | ------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------- |
| 8:00 AM  | **Lead review** — review new leads from tele-calling, portal inquiries, walk-ins; assign follow-up priorities | CRM, Leads        | `/crm`, `/leads`, `/m/leads`             |
| 8:30 AM  | **Call queue** — review calls to make today, follow up on missed calls, review call recordings                | Calls, Telephony  | `/calls`, `/telephony`, `/m/calls`       |
| 9:00 AM  | **Tele-calling** — make outbound calls to leads/prospects, log calls, update lead status                      | Calls, CRM        | `/calls`, `/m/calls`                     |
| 10:00 AM | **Customer management** — manage customer database, track interactions, update preferences                    | Customers, CRM    | `/customers`, `/crm`, `/m/customers`     |
| 11:00 AM | **Quotation preparation** — prepare quotations for prospects (unit price, CLP payment plan, T&C)              | Quotations        | `/quotations`, `/m/quotations`           |
| 12:00 PM | **Sale creation** — create sale orders (booking → ATS → BBA → registry → complete lifecycle)                  | Sales             | `/sales`, `/m/sales`                     |
| 2:00 PM  | **Portal listings** — manage property listings on portals (MagicBricks, 99acres, etc.)                        | Portal Listings   | `/portal-listings`, `/m/portal-listings` |
| 3:00 PM  | **Broker management** — coordinate with brokers, track commissions, manage broker relationships               | Brokers           | `/brokers`, `/m/brokers`                 |
| 4:00 PM  | **Follow-up calls** — follow up with prospects who visited site, negotiate, close deals                       | Calls, CRM        | `/calls`, `/crm`                         |
| 5:00 PM  | **Call analytics** — review call metrics, conversion rates, follow-up effectiveness                           | Calls → Analytics | `/calls` (analytics)                     |

#### Real-World Sales Workflows (India-Specific)

1. **Lead → Sale Lifecycle (RERA Compliant)**
   - Lead comes in: tele-calling, portal inquiry, walk-in, broker referral
   - Mani logs lead in CRM → qualifies → schedules site visit
   - Prospect selects unit → Mani prepares quotation (price, CLP schedule, T&C)
   - Prospect agrees → Mani creates **Sale Order** (booking stage)
   - Collect booking advance (max 10% — BBA must be registered per RERA Section 13)
   - Record payment: mode (cheque/RTGS/NEFT), cheque photo, bank details
   - Sale lifecycle stages:
     - **Booking** → token + allotment letter
     - **ATS signed** (Agreement to Sell) → upload ATS document
     - **BBA registered** (Builder-Buyer Agreement) → upload BBA, registered at Sub-Registrar
     - **CLP payments** → milestone-linked demand notices → customer pays → Manish records
     - **Sale Deed registered** → final title transfer at Sub-Registrar
     - **Complete** → possession handed over
   - **App**: `/leads` → `/crm` → `/quotations` → `/sales` (lifecycle timeline)

2. **Construction-Linked Payment (CLP) Collection**
   - Sale has payment schedule linked to WBS nodes (construction milestones)
   - Typical milestones: booking (10%), foundation (10%), 1st/4th/7th/10th slab
     (7.5% each), superstructure (10%), brickwork+plastering (10%), MEP (10%),
     finishing (10%), possession (10%)
   - As Anurag updates WBS node status (milestone complete) → demand notice
     auto-generates
   - Mani follows up with customer for payment → Manish records payment
   - GST applicable on each installment (1% affordable, 5% non-affordable — before CC/OC)
   - **App**: `/sales` → `PaymentScheduleItem` (linked to WBS nodes) → demand notices

3. **Broker Management**
   - Assign broker to a sale → track commission amount (brokerageAmount)
   - Broker commission typically 1–2% of sale value
   - Commission paid after sale completion (Manish processes)
   - Track broker performance, lead attribution
   - **App**: `/brokers` → `/sales` (brokerId, brokerageAmount)

4. **Tele-Calling Workflow**
   - Mani has a company phone number (CompanyPhone + PhoneAssignment in seed)
   - Makes outbound calls via Twilio/Exotel integration
   - Calls auto-logged with recording → Mani reviews recordings for quality
   - Call analytics: call count, duration, conversion rate, follow-up needed
   - **App**: `/calls` → `/telephony`

5. **Portal Listing Management**
   - List available units on real-estate portals (MagicBricks, 99acres, Housing.com)
   - Sync availability, price, photos, specifications
   - Track inquiries from each portal → route to CRM as leads
   - **App**: `/portal-listings`

6. **Rent / Tenancy Management**
   - If a unit is rented instead of sold → create tenancy agreement
   - Registered agreement upload (lease > 1 year must be registered per Registration Act 1908)
   - Monthly billing, yearly escalation (escalationPercent + escalationIntervalMonths)
   - Tenant change management
   - **App**: `/rentals`, `/rent`

7. **T&C Cost Allocation on Sales**
   - Each cost component has "borne by client or seller" toggle (SaleTerm.borneBy)
   - Components: land cost, registration, stamp duty, GST, legal, maintenance, parking, etc.
   - Manual free-text T&C for custom terms
   - **App**: `/sales` → sell dialog → SaleTermsEditor + SaleExpenseGrid

8. **Printable Sales Documents**
   - Sale order receipt (project, unit, deal price, advance, payment plan, T&C)
   - Sale invoice
   - Draft / LOI (Letter of Intent)
   - Payment receipts
   - **App**: `/print` → sale print pages

#### Handoffs

- **Receives from**: Marketing (leads), Anurag (construction milestones → demand
  notices), customers (payments)
- **Sends to**: Manish (sale payments → recording, broker commissions → payment),
  Vardaan (high-value sales → approval)

---

### 3.7 Yash Saxena — SITE_ENGINEER (H4)

**Role**: SITE_ENGINEER | **Tier**: 4 (Execution) | **Department**: Construction
**Reports to**: Anurag (PROJECT_DIRECTOR)
**Phone**: +91 73029 20205

#### Permissions Summary

Projects (view), inventory (view+manage+stock issue), procurement (view),
quotations (view), assets (view, rentals view), BOQ/WBS/MB (view+verify),
project control (view), HR (view, DPR view+submit), tasks (view), vehicles
(view), gate passes (view+create+manage), calls (view+create+edit+recording
listen), safety (view+manage).

#### Daily Rhythm (On Site)

| Time     | Workflow                                                                                                          | Modules                 | App Pages                           |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------- |
| 7:00 AM  | **GPS check-in** — geofence-based attendance check-in from phone with location                                    | Attendance              | `/m/attendance` (MobileSelfCheckIn) |
| 7:30 AM  | **Submit DPR** — Daily Progress Report: work done, labor count (DprLaborLine), material used, photos, voice notes | DPRs                    | `/m/dprs`                           |
| 8:00 AM  | **Material requisition** — raise material requisition for the day's work (what materials are needed)              | Requisitions            | `/m/requisitions`                   |
| 9:00 AM  | **Material issue** — issue materials from stock to the project/site (STOCK_ISSUE)                                 | Material Issues, Stock  | `/m/material-issues`, `/m/stock`    |
| 10:00 AM | **Measurement Book entries** — record work executed (quantity, location, description) for RA billing              | Measurement Book        | `/m/measurement-book`               |
| 12:00 PM | **Stock verification** — verify stock at site location, report discrepancies                                      | Inventory, Stock Counts | `/m/inventory`, `/m/stock-counts`   |
| 2:00 PM  | **Gate pass creation** — create gate passes for material movement out of site                                     | Gate Passes             | `/m/gate-pass`                      |
| 3:00 PM  | **Safety reporting** — report safety incidents, hazards, near-misses, inspections                                 | Safety                  | `/m/safety`                         |
| 4:00 PM  | **WBS progress update** — update WBS node status (completed/in-progress/not-started)                              | WBS                     | `/m/wbs`                            |
| 5:00 PM  | **Task updates** — update task status, mark completed, add notes                                                  | Tasks                   | `/m/my-tasks`                       |
| 6:00 PM  | **DPR finalization** — finalize and submit DPR for Anurag's approval                                              | DPRs                    | `/m/dprs`                           |

#### Real-World Site Engineer Workflows (India-Specific)

1. **Daily Attendance + DPR Cycle**
   - Yash arrives on site → GPS check-in (geofence verified)
   - Attendance status: P (present) / H (half-day) / Late / PL (paid leave) / NPL (no paid leave)
   - Fills DPR:
     - Work done today (activities, locations — wing/floor/grid)
     - Labor deployed (DprLaborLine with headcount by trade/subcontractor)
     - Materials consumed (with quantities)
     - Equipment used (with hours)
     - Photo capture: site progress photos (in-app camera, geo-tagged, no gallery import)
     - Voice note: optional voice briefing of day's work
     - Tomorrow's plan
   - Submit DPR → Anurag reviews → approves/rejects
   - Attendance tier: 🟡 (present, DPR pending) → 🟢 (present, DPR approved)
   - Stays 🟡 until Anurag approves — this is the gate that validates attendance with work evidence
   - **App**: `/m/attendance` → `/m/dprs` → Anurag approves → tier updates

2. **Material Requisition → Issue Cycle**
   - Yash identifies material need for the day's work
   - Creates material requisition (material, qty, project, justification)
   - Submits to Anurag for approval
   - Once approved → Raviraj procures (if stock low) OR issues from existing stock
   - Yash issues material from site stock location (STOCK_ISSUE) — records qty, project, built unit (if per-unit)
   - Stock ledger updated via `recordMovement()` (immutable — never mutate stock directly)
   - MAC (Moving Average Cost) carried on issue = current MAC (unchanged on issue)
   - **App**: `/m/requisitions` → `/m/material-issues` → `/m/stock-movements`

3. **Measurement Book (MB) Workflow (India-Specific)**
   - Yash records work executed per IS Code 1200 (Method of Measurement)
   - Each MB entry: BOQ item, location (wing/floor/grid), length × breadth × depth, quantity
   - Previous measurement + current measurement = cumulative measurement
   - Photo attachment (in-app, geo-tagged)
   - Submit MB entry → Anurag verifies (MB_VERIFY) via joint measurement → approves (MB_APPROVE)
   - Approved MB entries become basis for subcontractor RA billing
   - **App**: `/m/measurement-book` → Anurag verifies → `/work-orders` (RA bill)

4. **Gate Pass Workflow**
   - Material needs to leave site (return to warehouse, transfer to another site, scrap)
   - Yash creates gate pass (material, qty, destination, reason)
   - Anurag approves gate pass
   - Security guard confirms exit (GATE_PASS_EXIT) with photo
   - **App**: `/m/gate-pass` → Anurag approves → security confirms exit

5. **Safety Reporting**
   - Yash reports safety incidents, hazards, near-misses
   - Conducts safety inspections
   - Anurag reviews safety reports
   - BOCW (Building and Other Construction Workers) compliance
   - **App**: `/m/safety`

6. **Construction Progress Tracking**
   - Yash updates WBS node status (completed/in-progress/not-started)
   - This triggers construction-linked payment demand notices for sales
   - WBS node completion → demand notice auto-generates → Mani follows up → customer pays
   - **App**: `/m/wbs` → `/sales` (payment schedule linked to WBS nodes)

7. **Photo-DPR with OCR (Advanced)**
   - Yash can take a photo of material quantities / site measurements
   - OCR (OpenAI Vision / Google Vision / Azure DI) extracts quantities from photo
   - Auto-fills DPR labor/material lines
   - **App**: `/m/dprs` → photo capture → OCR → auto-fill

#### Handoffs

- **Receives from**: Anurag (task assignments, BOQ/WBS plans), Raviraj (materials
  delivered to site stock)
- **Sends to**: Anurag (DPRs → approval, requisitions → approval, MB entries →
  verification, gate passes → approval, safety reports → review)

---

## 4. Cross-Role Workflow Chains (End-to-End)

### Chain 1: Material Procurement (Requisition → PO → Receipt → Issue)

```
Yash (SITE_ENGINEER)
  → identifies material need
  → raises material requisition (material, qty, project, justification)
  → submits to Anurag
       │
Anurag (PROJECT_DIRECTOR)
  → reviews requisition
  → approves (REQUISITION_APPROVE)
       │
Raviraj (PROCUREMENT_MANAGER)
  → receives approved requisition
  → collects ≥3 quotations from suppliers (rate + terms)
  → comparative analysis → picks cheapest
  → creates PO from winning quote
       │
Vardaan/Anurag (OWNER/PROJECT_DIRECTOR)
  → approves PO (PO_APPROVE)
       │
Raviraj (PROCUREMENT_MANAGER)
  → sends PO to supplier
  → supplier delivers
  → creates Goods Receipt Note (GRN)
  → verifies qty + quality against PO
  → stock updated (recordMovement + MAC calculation)
       │
Yash (SITE_ENGINEER)
  → issues material from site stock to project (STOCK_ISSUE)
  → stock ledger updated (immutable)
  → cost allocated to project/unit
       │
Manish (FINANCE_HEAD)
  → receives supplier invoice
  → processes payment (deduct TDS 194C if applicable)
  → records cheque/RTGS/NEFT + cheque photo
```

### Chain 2: Sale Lifecycle (Lead → Booking → Registry → Payment)

```
Mani (SALES_MANAGER)
  → receives lead (tele-calling/portal/walk-in/broker)
  → qualifies lead → schedules site visit
  → prospect selects unit
  → prepares quotation (price, CLP schedule, T&C with borneBy toggles)
  → creates Sale Order (booking stage)
  → collects booking advance (MAX 10% — RERA Section 13)
  → Manish records payment (cheque/RTGS + photo)
  → uploads ATS document → ATS signed stage
  → uploads BBA document → BBA registered at Sub-Registrar (RERA compliant)
       │
Anurag (PROJECT_DIRECTOR)
  → construction progresses → updates WBS nodes
  → milestone hit (foundation/4th slab/10th slab/etc.)
  → demand notice auto-generated (PaymentScheduleItem linked to WBS)
       │
Mani (SALES_MANAGER)
  → follows up with customer for milestone payment
  → Manish records payment
  → GST applicable (1% affordable, 5% non-affordable — before CC/OC)
  → buyer deducts 1% TDS under 194IA if sale > ₹50L
  → construction completes → CC/OC issued
       │
Mani (SALES_MANAGER)
  → uploads sale deed → registry stage (final title transfer)
  → sale completes → possession handed over
  → defect liability period begins (5 years per RERA)
       │
Vardaan (OWNER)
  → reviews sale finalization
  → verifies 70% escrow compliance
```

### Chain 3: Subcontractor Payment (Work Order → RA → Payment)

```
Anurag (PROJECT_DIRECTOR)
  → issues work order to subcontractor (scope, rate, BOQ items)
       │
Yash (SITE_ENGINEER)
  → records Measurement Book entries (work done — L×B×D per IS 1200)
  → photo attachment (geo-tagged)
  → submits to Anurag
       │
Anurag (PROJECT_DIRECTOR)
  → verifies MB entries (MB_VERIFY) — joint measurement
  → approves MB entries (MB_APPROVE)
  → RA bill auto-generated from approved MB entries at BOQ rates
  → applies deductions: retention (5–10%), TDS (1%/2% under 194C), advance recovery
  → approves RA bill (RA_APPROVE)
       │
Manish (FINANCE_HEAD)
  → receives approved RA bill
  → processes payment (RA_PAY)
  → deducts TDS under 194C
  → records cheque/RTGS details + cheque photo
  → retention held until defect liability period ends
```

### Chain 4: Attendance → DPR → Payroll

```
Yash (SITE_ENGINEER)
  → GPS check-in (geofence verified)
  → attendance recorded (status: P/H/Late/PL/NPL)
  → fills DPR (work done, labor lines, materials, photos, voice)
  → submits DPR
  → attendance tier: 🟡 (present, DPR pending)
       │
Anurag (PROJECT_DIRECTOR)
  → reviews DPR
  → approves/rejects (DPR_APPROVE_ADMIN)
  → attendance tier: 🟢 (present, DPR approved)
  → OR rejects → tier stays 🟡 → Yash resubmits
       │
Manish (FINANCE_HEAD)
  → at month-end: generate payroll
  → auto-calculated from attendance (5-code rules)
  → late deductions applied (4 lates = 1 half-day)
  → 85% of half-day hours = half-day (not absent)
  → approves payroll
  → disburses salary
```

### Chain 5: Land Acquisition → Project → Construction → Sale

```
Vardaan (OWNER)
  → identifies land for purchase
  → due diligence: 7/12, EC (30 years), Mother Deed, CERSAI, mutation
  → reviews land cost breakup (base + lease + GST + reg + stamp)
  → decides: Freehold vs Leasehold (verify remaining tenure if leasehold)
  → approves purchase
  → land recorded → purchase lifecycle: BOOKED → BBA → REGISTERED → COMPLETED
       │
Vardaan (OWNER)
  → partitions land into plots (with valuation + asking price per plot)
  → OR creates project on un-partitioned land
       │
Anurag (PROJECT_DIRECTOR)
  → creates BOQ (engineer estimates)
  → builds WBS (construction phases)
  → sets project budget
  → assigns site engineers (Yash)
  → obtains RERA registration + NOCs (map sanction, fire, airport, environmental)
       │
Yash (SITE_ENGINEER)
  → daily construction (DPRs, material issues, MB entries)
  → updates WBS progress
       │
Mani (SALES_MANAGER)
  → lists units for sale (portal listings)
  → sells units (sale lifecycle — RERA compliant)
  → collects CLP payments (milestone-linked)
       │
Manish (FINANCE_HEAD)
  → tracks project cost vs budget
  → allocates costs to units (cost per sqft = totalProjectCost / totalSellableArea)
  → unit.productionCost = costPerSqft × unit.area
  → calculates unit profitability
  → GST compliance (1%/5%/12% based on property type)
  → TDS compliance (194C on contractors, 194IA on buyer)
  → RERA escrow reconciliation (70% rule)
```

### Chain 6: Gate Pass (Material Exit)

```
Yash (SITE_ENGINEER)
  → material needs to leave site (return/transfer/scrap)
  → creates gate pass (material, qty, destination, reason)
       │
Anurag (PROJECT_DIRECTOR) or Raviraj (PROCUREMENT_MANAGER)
  → reviews gate pass
  → approves (GATE_PASS_APPROVE)
       │
Security Guard (STORE_KEEPER or SUPERVISOR)
  → verifies material at gate
  → confirms exit (GATE_PASS_EXIT) with photo
  → gate pass closed
```

---

## 5. Role → Module Permission Matrix

| Module                | Vardaan (OWNER) | Sanjeev (ADMIN) |     Anurag (PD)     |   Manish (FH)    |  Raviraj (PM)  |     Mani (SM)     |    Yash (SE)    |
| --------------------- | :-------------: | :-------------: | :-----------------: | :--------------: | :------------: | :---------------: | :-------------: |
| **Dashboard**         |       ✅        |       ✅        |         ✅          |        ✅        |       ✅       |        ✅         |       ✅        |
| **Projects**          |    ✅ manage    |    ✅ manage    |      ✅ manage      |      👁 view      |     👁 view     |      👁 view       |     👁 view      |
| **BOQ**               |    ✅ manage    |    ✅ manage    |      ✅ manage      |      👁 view      |     👁 view     |         —         |  👁 view+verify  |
| **WBS**               |    ✅ manage    |    ✅ manage    |      ✅ manage      |      👁 view      |     👁 view     |         —         |     👁 view      |
| **Measurement Book**  |   ✅ approve    |   ✅ approve    |  ✅ verify+approve  |      👁 view      |     👁 view     |         —         |  👁 view+verify  |
| **Project Control**   |       ✅        |       ✅        |         ✅          |      👁 view      |     👁 view     |         —         |     👁 view      |
| **Inventory**         |    ✅ manage    |    ✅ manage    |       👁 view        |        —         |   ✅ manage    |         —         | ✅ manage+issue |
| **Procurement**       |    ✅ manage    |    ✅ manage    |  ✅ manage+approve  |      👁 view      |   ✅ manage    |         —         |     👁 view      |
| **Quotations**        |    ✅ manage    |    ✅ manage    |      ✅ manage      |      👁 view      |   ✅ manage    |     ✅ manage     |     👁 view      |
| **Purchase Orders**   |   ✅ approve    |   ✅ approve    |     ✅ approve      |        —         |   ✅ create    |         —         |        —        |
| **Requisitions**      |   ✅ approve    |   ✅ approve    |     ✅ approve      |        —         |   ✅ approve   |         —         |    ✅ create    |
| **Goods Receipt**     |       ✅        |       ✅        |          —          |        —         |       ✅       |         —         |        —        |
| **Suppliers**         |       ✅        |       ✅        |          —          |        —         |       ✅       |         —         |        —        |
| **Subcontractors/WO** |    ✅ manage    |    ✅ manage    |      ✅ manage      |        —         |       —        |         —         |        —        |
| **RA Bills**          | ✅ approve+pay  | ✅ approve+pay  |     ✅ approve      |      ✅ pay      |       —        |         —         |        —        |
| **Finance/GL**        |    ✅ manage    |    ✅ manage    |       👁 view        |    ✅ manage     |     👁 view     |         —         |        —        |
| **Expenses**          |   ✅ approve    |   ✅ approve    |          —          |    ✅ approve    |       —        |         —         |    ✅ create    |
| **Payroll**           |       ✅        |       ✅        |       👁 view        |    ✅ manage     |       —        |         —         |        —        |
| **Sales**             |    ✅ manage    |    ✅ manage    |          —          |      👁 view      |       —        | ✅ manage+create  |        —        |
| **CRM/Leads**         |       ✅        |       ✅        |          —          |        —         |       —        |        ✅         |        —        |
| **Brokers**           |       ✅        |       ✅        |          —          |        —         |       —        |        ✅         |        —        |
| **Portal Listings**   |       ✅        |       ✅        |          —          |        —         |       —        |        ✅         |        —        |
| **Land/Assets**       |    ✅ manage    |    ✅ manage    | ✅ manage+partition |      👁 view      |     👁 view     |      ✅ sell      |     👁 view      |
| **Rentals**           |       ✅        |       ✅        |         ✅          |      👁 view      |     👁 view     |        ✅         |     👁 view      |
| **HR/Attendance**     |       ✅        |       ✅        | 👁 view+DPR approve  |      👁 view      |       —        |         —         |    ✅ submit    |
| **DPRs**              |       ✅        |       ✅        |  ✅ admin approve   |      👁 view      |       —        |         —         |    ✅ submit    |
| **Tasks**             |    ✅ assign    |    ✅ assign    |      ✅ assign      |        —         |     👁 view     |      👁 view       |     👁 view      |
| **Gate Pass**         |     ✅ all      |     ✅ all      |     ✅ approve      |    ✅ approve    |   ✅ approve   |     ✅ create     |    ✅ create    |
| **Vehicles**          |       ✅        |       ✅        |       👁 view        |      👁 view      |   ✅ manage    |         —         |     👁 view      |
| **Calls**             |     ✅ all      |     ✅ all      |  ✅ all+analytics   | 👁 view+analytics | ✅ create+edit | ✅ full+analytics | ✅ create+edit  |
| **Telephony**         |       ✅        |       ✅        |       👁 view        |        —         |       —        |         —         |        —        |
| **Safety**            |       ✅        |       ✅        |      ✅ manage      |        —         |       —        |         —         |    ✅ manage    |
| **Users/Team**        |    ✅ manage    |    ✅ manage    |       👁 view        |      👁 view      |       —        |         —         |        —        |
| **Company Settings**  |       ✅        |       ✅        |          —          |        —         |       —        |         —         |        —        |
| **Workflows**         |       ✅        |       ✅        |          —          |        —         |       —        |         —         |        —        |
| **Audit Logs**        |       ✅        |       ✅        |       ✅ view       |        —         |       —        |         —         |        —        |
| **Legal/NOC**         |       ✅        |       ✅        |      ✅ manage      |    ✅ manage     |       —        |         —         |        —        |

Legend: ✅ = has permission, 👁 = view only, — = no access

---

## 6. Research Sources

### India Business & Regulatory Context

| Topic                              | Source                       | URL                                                                                                                              |
| ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| RERA Act 2016                      | India Code (official)        | https://www.indiacode.nic.in/handle/123456789/2158                                                                               |
| RERA FAQs                          | MoHUA (government)           | https://www.mohua.gov.in/static/uploads/2025/12/542144159b61c980253a694f478d3a5d.pdf                                             |
| Builder-Buyer Agreement            | Ghar.tv                      | https://www.ghar.tv/intelligence/builder-buyer-agreement-india-2026-key-clauses-red-flags/artgi205                               |
| BBA & RERA Rules                   | Inamdar Legal                | https://inamdarlegal.com/resources/builder-buyer-agreement-issues                                                                |
| BBA Guide                          | Aditya Birla Capital         | https://www.adityabirlacapital.com/abc-of-money/builder-buyer-agreement-india                                                    |
| RERA Escrow 70:30                  | Terra Insight                | https://www.terra-insight.com/insights/rera-escrow-account-reconciliation-india/                                                 |
| Land Acquisition Process           | TalkingLands                 | https://www.talkinglands.com/blogs/land-acquisition-process-in-india                                                             |
| Land Acquisition Software          | Proquiro                     | https://proquiro.com/solutions/real-estate-developers                                                                            |
| Property Due Diligence (EC, Title) | Ghar.tv                      | https://www.ghar.tv/intelligence/property-due-diligence-india-2026-encumbrance-certificate-title-search-legal-checklist/artgi160 |
| Freehold vs Leasehold              | Ghar.tv                      | https://www.ghar.tv/intelligence/freehold-vs-leasehold-property-india-2026-conversion-rights-resale-guide/artgi272               |
| Land Records (7/12, RoR)           | Ghar.tv                      | https://www.ghar.tv/intelligence/land-records-record-of-rights-india-2026-712-jamabandi-khata-khasra-guide/artgi328              |
| Title Verification                 | Construction Estimator India | https://constructionestimatorindia.com/how-to-verify-the-ownership-and-title-of-the-land-in-india/                               |
| Freehold vs Leasehold              | NoBroker Legal               | https://www.nobroker.in/blog/freehold-vs-leasehold-property-risk-checks/                                                         |
| GST for Real Estate                | Tax Garden                   | https://taxgarden.in/blog/real-estate-developer-gst-compliance-2026                                                              |
| GST Software for Developers        | ERP Group                    | https://www.erpgroup.in/blog/gst-software-for-real-estate-developers-india                                                       |
| TDS 194C for Developers            | MeraFinanceWala              | https://www.merafinancewala.com/articles/section-194c-tds-on-contractor-payments-for-real-estate-developers-fy-2025-26           |
| Indian RE Laws & GST               | Oxyhom                       | https://oxyhom.com/blog/indian-property-buying-guide-2026-rera-gst-fema-tds-legal-checklist                                      |
| CLP Payment Plan                   | Piramal Realty               | https://www.piramalrealty.com/blogs/construction-linked-payment-plan-how-clp-works                                               |
| CLP 2026                           | Rustomjee                    | https://www.rustomjee.com/blog/construction-linked-payment-plan-how-clp-works-in-2026/                                           |
| Demand Letter                      | Bajaj Housing Finance        | https://www.bajajhousingfinance.in/resources/what-is-demand-letter-from-builder                                                  |
| Demand Letter Checklist            | Finin2min                    | https://finin2min.com/articles/builder-demand-letter-payment-milestone-and-construction-proof-checklist.html                     |

### Construction Operations (India-Specific)

| Topic                             | Source          | URL                                                                                                      |
| --------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| Construction Procurement Process  | SiteSetu        | https://sitesetu.app/blog/construction-procurement-process-india                                         |
| Material Indent Management        | SiteSetu        | https://sitesetu.app/blog/material-indent-management-system                                              |
| Construction Procurement Software | SiteSetu        | https://sitesetu.app/construction-procurement-software                                                   |
| RA Bill Guide                     | SiteSetu        | https://sitesetu.app/blog/ra-bill-running-account-bill-construction-india                                |
| Measurement Book Guide            | SiteSetu        | https://sitesetu.app/blog/measurement-book-construction-india                                            |
| RA Bill Complete Guide            | VigiSolvo       | https://vigisolvo.com/blog/erp/what-is-ra-bill-in-construction-management-complete-guide-for-contractors |
| RA Bill Manager                   | RA Bill Manager | https://rabillmanager.com/                                                                               |
| RA Bill PMC Template              | Infralens       | https://infralens.in/pmc/billing/running-account-ra-bill                                                 |
| DPR Software                      | SiteSetu        | https://sitesetu.app/construction-daily-progress-report-software                                         |
| DPR App (Geo-tagged)              | SuperWise       | https://superwise.site/solutions/daily-progress-report-app                                               |
| DPR Reports                       | Yojo            | https://yojoapp.com/en/features/dpr-reports/                                                             |
| Site Modules                      | SiteSetu        | https://sitesetu.in/modules                                                                              |
| Construction ERP India            | BuilderXPro     | https://builderxpro.com/                                                                                 |
| Construction Management India     | Aasaan          | https://aasaan.co/construction-management-software-in-india/                                             |

### Real Estate Developer Tools (India)

| Topic                 | Source    | URL                                                                            |
| --------------------- | --------- | ------------------------------------------------------------------------------ |
| Real Estate ERP       | FlowSense | https://www.flowsense.solutions/resources/real-estate-erp-implementation-guide |
| Builders ERP          | Mexilet   | https://builders-erp.mexilet.com/                                              |
| Developer Tools India | Plotex    | https://plotex.in/blog/real-estate-developer-tools-india                       |

### Internal Sources (Repo)

| Topic                    | Source                         | Path                                                  |
| ------------------------ | ------------------------------ | ----------------------------------------------------- |
| Seed script (7 users)    | create-srg-users.mjs           | `apps/web/scripts/create-srg-users.mjs`               |
| RBAC roles + permissions | roles.ts                       | `apps/web/src/lib/roles.ts`                           |
| Owner transcripts        | USER_SESSION_BUSINESS_LOGIC.md | `docs/source-material/USER_SESSION_BUSINESS_LOGIC.md` |
| Product index            | DECISIONS.md                   | `DECISIONS.md`                                        |
| Agent conventions        | AGENTS.md                      | `AGENTS.md`                                           |
| Prisma schema            | schema.prisma                  | `packages/db/prisma/schema.prisma`                    |
