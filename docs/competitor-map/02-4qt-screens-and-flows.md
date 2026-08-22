# 02 — 4QT Screens and Flows

> 4QT is a vertical real-estate ERP. Its public docs describe modules and
> outcomes, not exact screen layouts. Screen names and field lists below are
> reconstructed from the official product pages, the 4QT CP customer-portal app
> store listing, and LinkedIn profiles of 4QT ERP operators. Items that need a
> vendor demo to confirm are marked `[inferred]`.

## Module list (10 core + 3 portals + mobile)

1. Lead Management (Pre-Sales)
2. CRM & Sales Management (Post-Sales)
3. Construction Procurement & Store Management
4. Construction Planning, Engineering & Project Management
5. Human Resource & Payroll Management
6. Financial Accounting Management
7. Post-Sales Customer Care Management
8. Commercial Rental/Lease Management
9. Facilities Management
10. Mall Management (specialized)

Portals: Customer Portal, Channel Partner Portal, Mobile App.

---

## MODULE 1 — LEAD MANAGEMENT (PRE-SALES)

### Screen: Lead Dashboard
- **Entry:** Main menu → Pre-Sales → Dashboard
- **Shows:** Lead funnel (New → Contacted → Qualified → Site Visit → Booking), source-wise counts, today's follow-ups, overdue follow-ups, hot leads
- **Actions:** Filter by source/date/assigned-to/status; click lead to open Lead Detail

### Flow: Lead Capture
- **Entry:** Pre-Sales → New Lead (or auto-created from portal/IVR/web form)
- **Trigger:** Manual entry / Magicbricks or 99Acres sync / IVR virtual number / Facebook/Instagram lead form / website chatbot
- **Steps:**
  1. Click "New Lead"
  2. Fill: Name, Phone, Email, Source (dropdown: Magicbricks/99Acres/CommonFloor/Housing/Makaan/Direct/Referral/Social), Project of interest, Budget range, Timeline
  3. Auto-assignment rule fires (territory-based or round-robin)
  4. Save → lead appears on assigned telecaller's dashboard
- **Clicks:** ~8 fields + Save = ~9 taps
- **Result:** Lead record created, assignment notification sent, lead enters "New" status
- **Auto-lead assignment:** configurable rule — by project, by city, by source, round-robin among sales execs

### Flow: Lead Nurturing & Follow-Up
- **Entry:** Lead Detail → Schedule Follow-Up
- **Trigger:** Manual / automated reminder based on no-contact days
- **Steps:**
  1. Open lead
  2. Log call outcome (Connected/No Answer/Callback)
  3. Schedule next follow-up date/time
  4. Send email/SMS/WhatsApp from template
  5. Update lead status (New → Contacted → Qualified → Hot/Warm/Cold)
- **Lead scoring:** engagement + interaction frequency + source + budget + timeline → Hot/Warm/Cold
- **Clicks:** ~5 taps per follow-up cycle
- **Result:** Activity logged on lead timeline, next reminder scheduled, score recalculated

### Flow: Site Visit Booking
- **Entry:** Lead Detail → Schedule Site Visit
- **Steps:**
  1. Select date/time
  2. Assign sales exec
  3. Send calendar invite + SMS to lead
  4. On visit day: mark attendance (GPS-tagged `[inferred]`)
  5. Post-visit: log feedback, update lead status
- **Clicks:** ~6 taps

### Flow: Lead Conversion to Booking
- **Entry:** Lead Detail → Convert to Booking
- **Trigger:** Lead qualified + booking amount received
- **Steps:**
  1. Select unit from available inventory (double-booking prevention check)
  2. Enter booking amount
  3. Generate allotment letter
  4. Lead → Customer conversion
  5. Payment schedule auto-created (CLP/TLP/DPP based on project config)
- **Clicks:** ~10 taps
- **Result:** Lead archived, Customer record created, Booking record created, Unit status → Booked, Allotment letter PDF generated, welcome email sent
- **See Post-Sales module for the continuation**

---

## MODULE 2 — CRM & SALES MANAGEMENT (POST-SALES)

### Screen: Customer Master
- **Fields:** Customer ID, Name, KYC docs (PAN/Aadhaar/Passport), Address, Phone, Email, Co-applicants, Project, Unit, Booking date, Payment plan type
- **Actions:** View, Edit, Upload KYC, Generate documents

### Flow: Booking → Allotment
- **Entry:** Converted from Lead (above) OR direct booking
- **Steps:**
  1. Customer application form (KYC, co-applicant, nomination)
  2. Booking amount receipt
  3. Allotment letter generation (template: unit no, area, price, payment plan)
  4. Welcome letter generation
  5. Builder-Buyer Agreement (BBA) / Construction Agreement / Bank Tri-Partite Agreement generation
- **Documents generated:** Allotment Letter, Welcome Letter, BBA, Construction Agreement, Tri-Partite, Sale Deed, NOC
- **Clicks:** ~15 taps across the document set
- **Result:** Unit → Booked, customer timeline updated, documents stored in customer DMS

### Flow: Payment Schedule + Demand Notice
- **Entry:** Booking detail → Payment Schedule tab
- **Trigger:** Booking creation (auto-setup) + construction milestone completion (auto-demand)
- **Steps:**
  1. Auto-create payment plan (CLP: 10% on booking, 10% on slab, ... 5% on possession)
  2. On milestone completion: auto-generate demand notice
  3. Send demand via WhatsApp + Email + SMS
  4. Payment reminders: pre-due (3 days before), due day, post-due (3/7/15 days)
  5. Interest calculation on overdue (configurable rate per project, simple or compound)
- **Clicks:** Auto for demand generation; ~3 taps to send manual reminder
- **Result:** Demand notice PDF, notification log entry, outstanding updated

### Flow: Payment Receipt
- **Entry:** Customer detail → Receive Payment
- **Steps:**
  1. Select demand/installment
  2. Enter amount, mode (Cheque/RTGS/NEFT/Cash/Card)
  3. Generate receipt
  4. Update outstanding
  5. Send receipt via WhatsApp/Email
- **Clicks:** ~6 taps
- **Result:** Receipt PDF, GL entry (Dr Bank, Cr Customer), outstanding reduced

### Flow: Cancellation / Surrender / Transfer
- **Cancellation:**
  1. Customer detail → Cancel Booking
  2. Calculate cancellation fee + refund (configurable rules)
  3. Approval workflow → Admin
  4. Refund processing
  5. Unit → Available
- **Transfer:**
  1. Customer detail → Transfer
  2. Transfer fee calculation
  3. Approval workflow (family vs third-party rules differ)
  4. New customer KYC
  5. Unit ownership transferred
- **Surrender:** similar to cancellation but with different fee logic
- **Clicks:** ~8-12 taps depending on path

### Flow: Registration & Possession
- **Entry:** Customer detail → Registration / Possession tab
- **Registration:**
  1. Sale deed generation
  2. Registration date, sub-registrar details
  3. NOC generation
  4. Stamp duty calculation
- **Possession:**
  1. Possession notice generation
  2. Handover checklist (snagging, fittings, utilities)
  3. Possession certificate
  4. Final settlement (any pending dues)
  5. Keys handover acknowledgment
- **Clicks:** ~12 taps across the full possession flow

### Screen: Broker / Channel Partner Management
- **Fields:** Broker ID, Name, Firm, RERA no, Commission slab, Projects, Performance
- **Commission:** slab-based, on booking amount vs collection amount, scheduled payouts
- **Reports:** Broker-wise bookings, collections, commission due/paid, performance ranking

---

## MODULE 3 — CONSTRUCTION PROCUREMENT & STORE MANAGEMENT

### Flow: Material Requisition (Indent)
- **Entry:** Site → Raise Indent
- **Steps:**
  1. Select project, site
  2. Add material lines (material, qty, required-by date)
  3. Submit for approval
  4. Approver reviews → Approve/Reject
  5. Approved indent → routes to procurement
- **Clicks:** ~8 taps
- **Result:** Indent record, approval log, procurement queue entry

### Flow: RFQ → Quote Comparison → PO
- **Entry:** Approved Indent → Create RFQ
- **Steps:**
  1. Select vendors to send RFQ (multi-select)
  2. Send RFQ via email
  3. Receive quotes (vendor portal or manual entry)
  4. Comparative statement auto-generated (rate, landed cost, taxes, delivery)
  5. Select winning quote → Create PO
  6. PO approval workflow
  7. Approved PO → sent to supplier
- **Clicks:** ~15 taps end to end
- **Result:** PO record, vendor notification, commitment in budget

### Flow: GRN (Material Receipt Note)
- **Entry:** PO → Receive Goods
- **Steps:**
  1. Select PO
  2. Enter received qty per line
  3. Quality check (pass/fail, remarks)
  4. Generate GRN
  5. Stock updated (qty in, location)
  6. 3-way match: PO vs GRN vs supplier invoice
  7. Invoice approval → payment
- **Clicks:** ~10 taps
- **Result:** GRN record, StockMovement IN, GL entry (Dr Stock, Cr Supplier), invoice pending

### Flow: Material Issue
- **Entry:** Site → Issue Material
- **Steps:**
  1. Select project, cost code
  2. Select material, qty
  3. Issue to project / unit / contractor
  4. Stock deducted
  5. Cost allocated to project
- **Clicks:** ~6 taps
- **Result:** Issue slip, StockMovement OUT, GL entry (Dr Project Cost, Cr Stock)

### Flow: Stock Return / Supplier Return
- **Entry:** Stock → Return to Supplier
- **Steps:** Select material, qty, reason, supplier → Credit note → Stock reversed
- **Clicks:** ~5 taps

### Screen: Stock Dashboard
- **Shows:** Current stock by project/site, reorder alerts, ageing analysis, stock valuation
- **Reorder logic:** reorder point + EOQ + safety stock + lead time `[inferred]`
- **Auto-reorder:** when stock drops to reorder point, auto-generate indent `[inferred]`

---

## MODULE 4 — CONSTRUCTION PLANNING & PROJECT MANAGEMENT

### Screen: Project Cockpit
- **Tabs:** Overview, BOQ, WBS, Stages, Tasks, DPR, Costs, Quality, Safety, Documents, Change Orders, Activity
- **Overview:** progress %, budget vs actual, schedule variance, cost variance, EVM metrics (PV/EV/AC/CPI/SPI/EAC)

### Flow: BOQ + Rate Analysis
- **Entry:** Project → BOQ
- **Steps:**
  1. Import BOQ from Excel or manual entry
  2. Line items: description, qty, unit, rate, amount
  3. Rate analysis per item (material + labour + overhead + profit)
  4. Budget approval
- **Clicks:** ~20 taps for a full BOQ (line-item heavy)

### Flow: WBS + Scheduling
- **Entry:** Project → WBS
- **Steps:**
  1. Create WBS hierarchy (Project → Phase → Stage → Task)
  2. Assign durations, dependencies (predecessor/successor)
  3. Auto-calculate ES/EF/LS/LF + critical path
  4. Gantt chart view
  5. Milestone marking
- **Clicks:** ~15 taps for a small WBS

### Flow: DPR (Daily Progress Report)
- **Entry:** Site → New DPR (mobile or desktop)
- **Steps:**
  1. Select project, date, work type
  2. Enter planned vs actual qty
  3. Material consumption lines
  4. Labour headcount
  5. Equipment used
  6. Photo upload (progress evidence)
  7. Submit → approval (single-tier `[inferred]`)
- **Clicks:** ~12 taps
- **Result:** DPR record, progress % updated, variance flagged

### Flow: Contractor Work Order + RA Bill
- **Entry:** Project → Work Orders → New
- **Work Order:**
  1. Select contractor, scope (from BOQ), agreed rates
  2. Work order approval
  3. Issue to contractor
- **RA Bill:**
  1. Contractor submits RA bill (qty executed)
  2. QS verifies against measurement book
  3. Cumulative check against work order scope
  4. Deduct: advance, retention, TDS
  5. Net payable calculated
  6. Approval → payment
- **Clicks:** ~18 taps end to end

### Flow: Change Order
- **Entry:** Project → Change Orders → New
- **Steps:**
  1. Description of change
  2. Impact analysis (cost + schedule)
  3. Approval workflow
  4. Budget revision
  5. BOQ/WBS update
- **Clicks:** ~8 taps

### Flow: Quality Control
- **Entry:** Project → Quality → New Inspection
- **Steps:** Checklist selection → inspection → pass/fail → NCR if fail → CAPA → closure
- **Clicks:** ~7 taps

### Flow: Safety Management
- **Entry:** Project → Safety → New Incident
- **Steps:** Incident details → severity → corrective action → compliance report
- **Clicks:** ~6 taps

---

## MODULE 5 — HR & PAYROLL

### Screen: Employee Master
- **Fields:** Emp ID, Name, Designation, Department, Project, Joining date, Salary structure, Bank, PF/ESI no

### Flow: Attendance
- **Entry:** HR → Attendance (or mobile biometric/GPS)
- **Modes:** Biometric device sync, mobile GPS check-in, manual entry
- **Clicks:** 1 tap for GPS check-in (mobile)

### Flow: Leave
- **Entry:** Employee → Apply Leave → Approver approves
- **Clicks:** ~5 taps

### Flow: Payroll Processing
- **Entry:** HR → Payroll → Run Payroll
- **Steps:**
  1. Select month
  2. Auto-calculate: basic + allowances + overtime − PF − ESI − TDS − PT
  3. Generate payslips
  4. Bank disbursement file
  5. GL entry (Dr Salary Expense, Cr Bank/PF/ESI/TDS)
- **Clicks:** ~6 taps for a full run
- **Statutory:** PF, ESI, PT, TDS, NPS

---

## MODULE 6 — FINANCIAL ACCOUNTING

### Screen: GL / Chart of Accounts
- **Structure:** Multi-company, project-wise tracking, cost centres
- **Integration:** Exports to Tally, SAP, Oracle, QuickBooks, Xero

### Flow: Expense Recording
- **Entry:** Finance → New Expense
- **Steps:** Amount, category, project, approval → GL entry
- **Clicks:** ~6 taps

### Flow: Bank Reconciliation
- **Entry:** Finance → Bank Recon
- **Steps:** Import bank statement → match → reconcile `[inferred]`
- **Clicks:** ~5 taps per match

### Reports (Accounting)
- Trial Balance, P&L, Balance Sheet, Cash Flow, Fund Flow
- Debtors/Creditors ageing, GST returns, TDS returns
- Project-wise P&L, cost centre summary, budget vs actual

---

## MODULE 7 — POST-SALES CUSTOMER CARE

### Screen: Complaint / Ticket
- **Entry:** Customer Portal → Raise Query (customer) OR internal → New Ticket
- **Fields:** Category, priority, description, photos
- **Flow:** Ticket → Assignment → Resolution → Closure → Satisfaction survey
- **SLA tracking** `[inferred]`

### Screen: Customer Portal (separate app — 4QT CP)
Per the App Store listing, the customer portal app has these screens:
- Applicant Details
- Property Details (floor plans, amenities, specifications)
- Account Details
- Payment Plan
- Demand Letter
- Receipt (download)
- Applicant Legal Docs
- Raise a Query
- Due (pending dues)
- Construction (progress tracking)
- Refer Us (referral)
- Profile

---

## MODULE 8 — COMMERCIAL RENTAL / LEASE

- Lease agreements, enquiries, rent, allotments, transitions
- Lease audits, utility bills, payments, bank, accounts
- Dashboard, MIS, performance reports

---

## MODULE 9 — FACILITIES MANAGEMENT

- Asset management, maintenance, work orders, preventive maintenance
- Space planning, allocation
- Service vendor management, contracts

---

## MODULE 10 — MALL MANAGEMENT (specialized)

- Space planning, rental/lease, marketing/lead, sales/billing/CRM
- Supply chain, purchase/payables, asset, work order
- HR/payroll, financial accounting

---

## PORTALS

### Customer Portal (4QT CP app)
- **Identity:** Customer login (separate from staff)
- **Screens:** See Module 7 above
- **Purpose:** Self-service for payment status, documents, progress, queries

### Channel Partner Portal
- **Identity:** Broker/channel partner login
- **Screens:** Leads, Bookings, Inventory, Commission, Performance, Sales Updates
- **Purpose:** Brokers manage their leads, see available inventory, track commission

### Mobile ERP App (staff)
- **Screens:** Approvals, Reports, Leads, Construction Updates, Customer Info
- **Purpose:** On-the-go access for staff

---

## ROLES (11 defined)

Administrator, Sales Manager, Sales Executive, Channel Partner/Broker, Project Manager, Procurement Manager, Site Engineer, Accountant, HR Manager, Customer Service, Customer

---

## INTEGRATIONS

- **Accounting:** Tally, SAP, Oracle, QuickBooks, Xero
- **Property portals:** Magicbricks, 99Acres, CommonFloor, Housing.com, Makaan
- **Comms:** IVR/virtual number, email, SMS, WhatsApp, Google Workspace, Microsoft 365
- **Productivity:** Salesforce, Zapier, Dropbox
- **Payments:** Stripe, bank RTGS/NEFT
- **Analytics:** Google Analytics, BI tools

---

## KEY BUSINESS LOGIC

| Logic | How it works |
|---|---|
| Lead scoring | engagement + interaction frequency + source + budget + timeline → Hot/Warm/Cold |
| Commission | slab-based, on booking vs collection amount, scheduled payouts |
| Payment schedule | stage-wise tied to construction progress → auto demand notices → reminders |
| Interest | delayed payment interest, configurable rate per project, compound vs simple |
| Cancellation | fee + refund + deduction rules + approval workflow |
| Transfer | transfer fee + approval + family vs third-party rules |
| Reorder | reorder point + EOQ + safety stock + lead time |
| Cost allocation | material to project + indirect/overhead + transport + storage |
| 3-way matching | PO vs GRN vs invoice qty/rate with tolerance limits |
| Vendor evaluation | on-time delivery + quality + price competitiveness → rating |
| EVM | PV, EV, AC, SPI, CPI, EAC |
| Critical path | dependency analysis, ES/EF/LS/LF, slack/float |
| Depreciation | SLM + WDV, category-wise rates |
| Provisioning | bad debt, warranty, gratuity, leave encashment |
