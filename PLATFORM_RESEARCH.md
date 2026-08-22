# Platform Research Map: 4QT vs Tally (TallyPrime) vs Zoho

> Comprehensive mapping of every module, page, flow, and business logic across all three platforms.
> Compiled for feature-parity / integration analysis for Nirman Inventory OS.

---

## TABLE OF CONTENTS
1. [Executive Summary & Positioning](#1-executive-summary--positioning)
2. [Platform Architecture Comparison](#2-platform-architecture-comparison)
3. [Module Coverage Matrix](#3-module-coverage-matrix)
4. [4QT — Complete Map](#4-4qt--complete-map)
5. [Tally (TallyPrime) — Complete Map](#5-tally-tallyprime--complete-map)
6. [Zoho — Complete Map](#6-zoho--complete-map)
7. [Sales / "Sale Calling" Deep Dive](#7-sales--sale-calling-deep-dive)
8. [Procurement & Inventory Deep Dive](#8-procurement--inventory-deep-dive)
9. [Accounting / GL Deep Dive](#9-accounting--gl-deep-dive)
10. [Construction / Project Management Deep Dive](#10-construction--project-management-deep-dive)
11. [CRM / Lead Management Deep Dive](#11-crm--lead-management-deep-dive)
12. [HR / Payroll Deep Dive](#12-hr--payroll-deep-dive)
13. [Reports Comparison](#13-reports-comparison)
14. [Integrations & APIs](#14-integrations--apis)
15. [Roles & Permissions](#15-roles--permissions)
16. [Pricing Comparison](#16-pricing-comparison)
17. [Gap Analysis vs Nirman Inventory OS](#17-gap-analysis-vs-nirman-inventory-os)
18. [Nirman Integration Blueprint](#18-nirman-integration-blueprint)
19. [Why Customers Pay](#19-why-customers-pay)
20. [Modular Product Architecture](#20-modular-product-architecture)
21. [Mobile-First Product Map](#21-mobile-first-product-map)

---

## 1. EXECUTIVE SUMMARY & POSITIONING

| Dimension | 4QT | Tally (TallyPrime) | Zoho (Zoho One) |
|---|---|---|---|
| **Type** | Vertical ERP (Real Estate / Construction) | Horizontal Accounting + Inventory ERP | Suite of 55+ horizontal SaaS apps |
| **Origin** | India (Noida, 2015) | India (Bangalore, 1986) | India (Chennai, 1996) |
| **Target** | Builders, developers, contractors | SMBs across all industries | SMBs to mid-market, all industries |
| **Deployment** | Cloud + On-prem | Desktop + Cloud access + TallyPrime Cloud | Cloud-only (SaaS) |
| **Customers** | 800+ in 35+ Indian cities | 2M+ businesses globally | 100M+ users globally |
| **Differentiator** | Industry-specific workflows (RERA, possession, broker commission) | Deep accounting + GST compliance + 400+ reports | Best-in-suite integration + low-code (Creator) + Deluge scripting |
| **Pricing** | Custom quote | One-time license + AMC | Per-user subscription (Zoho One ~$37–90/user/mo) |
| **API Maturity** | Limited (no public docs) | XML/JSON/ODBC + TDL | Mature REST APIs + OAuth2 + SDKs + Zoho Flow |

**Key takeaway:** 4QT is the closest functional analog to Nirman (vertical real-estate ERP). Tally is the accounting/GST gold standard to integrate with. Zoho is the modular suite to learn UX/integration patterns from.

---

## 2. PLATFORM ARCHITECTURE COMPARISON

### 4QT
- **Stack:** React/Angular frontend, .NET/C# + Python/Java backend, MS SQL Server / MySQL / MongoDB, GCP, Docker/K8s
- **Access:** Web + iOS/Android apps + Customer Portal + Channel Partner Portal
- **Multi-tenancy:** Multi-company, multi-project
- **APIs:** REST/GraphQL (not publicly documented)

### TallyPrime
- **Stack:** Native C++ desktop app, proprietary file-based DB (.900 files), TDL (Tally Definition Language) for customization
- **Access:** Desktop (Windows), TallyPrime Cloud Access (remote), online report viewer, mobile report access
- **Multi-tenancy:** Multi-company (unlimited), Group Company for consolidation
- **APIs:** XML (HTTP), JSON (v3.0+), ODBC, TDL HTTP actions

### Zoho
- **Stack:** Cloud-native, per-app microservices, Deluge scripting language, REST APIs, OAuth2
- **Access:** Web + native iOS/Android per-app + Zoho One unified mobile app
- **Multi-tenancy:** Multi-org per app, Zoho Directory for SSO
- **APIs:** REST per app, SDKs (Java/Python/Node/PHP/.NET/Ruby), Zoho Flow (1000+ connectors), webhooks

---

## 3. MODULE COVERAGE MATRIX

| Module | 4QT | Tally | Zoho (which app) |
|---|---|---|---|
| Lead Management / CRM | ✅ Built-in | ❌ (manual ledgers) | ✅ Zoho CRM |
| Sales / Booking | ✅ Built-in | ✅ Sales vouchers | ✅ Zoho Books/Invoice |
| Procurement / PO | ✅ Built-in | ✅ Purchase vouchers | ✅ Zoho Inventory/Books |
| Inventory / Stock | ✅ Built-in | ✅ Deep | ✅ Zoho Inventory |
| Construction / Project Mgmt | ✅ Built-in (core) | ⚠️ Cost centres only | ✅ Zoho Projects |
| BOQ / Rate Analysis | ✅ Built-in | ❌ | ❌ (needs Creator) |
| DPR (Daily Progress Report) | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Contractor / Work Order | ✅ Built-in | ⚠️ Job work | ❌ (needs Creator) |
| Accounting / GL | ✅ Built-in | ✅ Gold standard | ✅ Zoho Books |
| GST / Tax Compliance | ✅ Built-in | ✅ Gold standard | ✅ Zoho Books |
| Tally Integration | ✅ (exports to Tally) | — | ✅ (via Flow) |
| HR / Payroll | ✅ Built-in | ✅ Payroll module | ✅ Zoho People + Payroll |
| Attendance (GPS/biometric) | ✅ Built-in | ⚠️ Attendance voucher | ✅ Zoho People |
| Customer Portal | ✅ Built-in | ❌ | ✅ Zoho Desk/CRM portal |
| Channel Partner / Broker Portal | ✅ Built-in | ❌ | ⚠️ Via CRM partner portal |
| Post-sales / Complaints | ✅ Built-in | ❌ | ✅ Zoho Desk |
| Lease / Rental Management | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Facilities / Mall Management | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Land / Parcel Management | ✅ Built-in | ❌ | ❌ (needs Creator) |
| Banking / Reconciliation | ✅ Built-in | ✅ Deep | ✅ Zoho Books |
| Manufacturing / BoM | ❌ | ✅ | ✅ Zoho Inventory (composite items) |
| Job Work | ❌ | ✅ | ⚠️ Via Inventory |
| Low-Code Custom Apps | ❌ | ⚠️ TDL | ✅ Zoho Creator |
| Business Intelligence | ⚠️ Basic dashboards | ⚠️ 400+ reports | ✅ Zoho Analytics |
| Workflow Automation | ✅ Built-in | ⚠️ TDL | ✅ Zoho Flow + Blueprints |
| Document E-Sign | ⚠️ Doc gen only | ❌ | ✅ Zoho Sign |
| Expense Management | ✅ Built-in | ⚠️ Journal | ✅ Zoho Expense |
| Field Service | ❌ | ❌ | ✅ Zoho FSM |
| Email / SMS / WhatsApp | ✅ Built-in | ❌ | ✅ Zoho Campaigns/Cliq/SalesIQ |

---

## 4. 4QT — COMPLETE MAP

### 4.1 Modules (10 core + portals)

#### MODULE 1: LEAD MANAGEMENT (PRE-SALES)
- Lead Capture & Distribution (web forms, landing pages, social, chatbot, IVR/virtual number, property portals: Magicbricks/99Acres/CommonFloor)
- Lead Tracking & Insights (activity tracking, lead scoring, analytics, behavioral analytics, source tracking)
- Lead Nurturing (automated workflows, content mgmt, follow-up reminders, multi-channel engagement)
- Lead Assignment (automated, territory-based, round-robin)
- Reporting & Analytics (dashboards, conversion tracking, ROI, campaign reports)

#### MODULE 2: CRM & SALES MANAGEMENT (POST-SALES)
- Customer Management (application processing, KYC, profile, history)
- Booking Management (inventory status, booking, allotment, double-booking prevention)
- Payment Management (payments & receipts, schedules, demand notices, reminders, outstanding tracking)
- Document Generation (welcome letters, receipts, sale agreements, construction agreements, bank tri-partite, sale deed, NOC)
- Transaction Management (registrations, transfers, surrenders, cancellations)
- Tax Management (service tax, VAT, interest calc, GST)
- Broker Management (registration, commission, performance)
- Collection Management (tracking, recovery, aging)
- Integration (Tally, email, SMS)

#### MODULE 3: CONSTRUCTION PROCUREMENT & STORE MANAGEMENT
- Procurement (indent, quote, PO, MRN, supplier mgmt, vendor comparison, bid mgmt)
- Inventory (stock, issue, return, reorder, ageing, real-time tracking, auto-reorder)
- Quality Control (QC, inspection, reports)
- Supplier Portal (dashboard, performance, relationship)
- Cost Management (expense recording, budget forecasting, cost tracking, financial reporting)

#### MODULE 4: CONSTRUCTION PLANNING, ENGINEERING & PROJECT MANAGEMENT
- Project Planning (BOQ, rate analysis, estimation, costing, budgeting, planning)
- Project Management (contractor & work order, stages, tasks, schedules, DPR, quality, dashboard)
- Contract Management (creation, tracking, approvals, documents)
- Change Order Management (creation, approval, tracking, budget impact)
- Bid Management (RFQ, analysis, comparison, award)
- Resource Management (allocation, scheduling, availability)
- Scheduling (Gantt, milestones, timeline, critical path)
- Equipment Management (tracking, scheduling, maintenance, cost)
- Time Tracking (labor, equipment, timesheets)
- Quality Control (checklists, inspections, NCR, CAPA)
- Safety Management (checklists, incident reporting, compliance)
- Document Management (repository, versioning, approval workflows, sharing)

#### MODULE 5: HUMAN RESOURCE & PAYROLL MANAGEMENT
- Employee Management (onboarding, profiles, records, org structure)
- Attendance Management (tracking, leave, shifts, biometric)
- Payroll Management (processing, salary calc, deductions, payslips, reports)
- Performance Management (reviews, goals, appraisals)
- Workforce Planning (resource planning, recruitment, training)
- Compliance (statutory, PF/ESI, tax)

#### MODULE 6: FINANCIAL ACCOUNTING MANAGEMENT
- Financial Transactions (AR, AP, GL, bank reconciliation, cash)
- Financial Management (transactions, expense tracking, revenue, budgeting, project-wise tracking)
- Financial Reporting (P&L, balance sheet, cash flow, trial balance)
- Tax Management (GST/VAT, TDS, tax reports)
- Integration (Tally, SAP, Oracle, QuickBooks, Xero)

#### MODULE 7: POST SALES CUSTOMER CARE MANAGEMENT
- Customer Service (complaints, trouble tickets, resolution, service requests)
- Customer Portal (self-service, payment status, documents, progress updates)
- Possession Management (handover, checklists, certificates)
- Communication (notifications, alerts)

#### MODULE 8: COMMERCIAL RENTAL/LEASE MANAGEMENT
- Lease Management (agreements, enquiries, rent, allotments, transitions)
- Lease Operations (audits, utility, bills, payments, bank, accounts)
- Reporting (dashboard, MIS, performance)

#### MODULE 9: FACILITIES MANAGEMENT
- Facility Management (assets, maintenance, work orders, preventive maintenance)
- Space Management (planning, allocation)
- Vendor Management (service vendors, contracts)
- Reporting

#### MODULE 10: MALL MANAGEMENT (specialized)
- Space planning, rental/lease, marketing/lead, sales/billing/CRM, supply chain, purchase/payables, asset, work order, HR/payroll, financial accounting

### 4.2 Portals & Mobile
- **Customer Portal:** property info, payment schedules/status, documents, progress, KYC, demands
- **Channel Partner Portal:** leads, bookings, inventory, commission, performance, sales updates
- **Mobile App (iOS/Android):** lead capture, centralized DB, scoring, assignment, comms, task tracking, analytics, inventory, KYC, demands

### 4.3 Key Flows

#### Pre-Sales Flow (Lead → Booking)
1. Lead capture (web/portal/IVR/social/chatbot/phone)
2. Lead assignment (auto/manual/round-robin)
3. Lead nurturing (email/SMS campaigns, follow-ups, scoring)
4. Lead conversion (site visit, quotation, negotiation, booking confirm)
5. Booking (application, KYC, booking amount, allotment letter, agreement)

#### Post-Sales Flow (Customer Lifecycle)
1. Welcome letter + payment schedule setup
2. Demand notice generation → payment receipt → outstanding tracking → interest calc → recovery
3. Construction progress updates → stage-wise demands → change order comms
4. Documentation (sale agreement, tri-partite, registration, NOC)
5. Possession (notice, checklist, certificate, final settlement)
6. Post-possession (complaints, warranty, maintenance)

#### Procurement Flow
1. Material requisition (indent) → approval → budget check
2. RFQ → quote comparison → bid analysis → supplier selection
3. PO generation → approval → sent to supplier
4. GRN → quality check → quantity verify → stock update
5. Material issue → stock deduction → cost allocation to project
6. Invoice → 3-way matching (PO/GRN/invoice) → approval → payment
7. Return → credit note → stock adjustment

#### Project Management Flow
1. Project setup (BOQ, rate analysis, estimation, budget approval)
2. Planning (WBS, stages, tasks, Gantt, resources, milestones)
3. Execution (DPR, task completion, resource/equipment utilization, time tracking)
4. Quality control (inspections, checklists, NCR, CAPA)
5. Change management (request, impact, approval, budget/schedule revision)
6. Contractor management (work order, progress billing, payment, evaluation)
7. Monitoring (cost vs budget, schedule vs plan, risk)
8. Closure (final billing, handover docs, closure report)

### 4.4 Business Logic Highlights
- **Lead scoring:** engagement + interaction frequency + source + budget + timeline → Hot/Warm/Cold
- **Commission:** slab-based, on booking vs collection amount, scheduled payouts
- **Payment schedule:** stage-wise tied to construction progress → auto demand notices → reminders (pre-due, due, post-due)
- **Interest:** delayed payment interest, configurable rate per project, compound vs simple
- **Cancellation:** fee + refund + deduction rules + approval workflow
- **Transfer:** transfer fee + approval + family vs third-party rules
- **Reorder:** reorder point + EOQ + safety stock + lead time
- **Cost allocation:** material to project + indirect/overhead + transport + storage
- **3-way matching:** PO vs GRN vs invoice qty/rate with tolerance limits
- **Vendor evaluation:** on-time delivery + quality + price competitiveness → rating
- **EVM:** PV, EV, AC, SPI, CPI, EAC
- **Critical path:** dependency analysis, ES/EF/LS/LF, slack/float
- **Depreciation:** SLM + WDV, category-wise rates
- **Provisioning:** bad debt, warranty, gratuity, leave encashment

### 4.5 Data Model (key entities)
- Project → Unit/Property → Booking → Payment
- Lead → Customer (on conversion)
- Vendor → PurchaseOrder → POItem → Material
- Contractor → WorkOrder
- Employee → Attendance / Payroll / Leave
- Customer → Complaint/Ticket
- Project → Stage → Task
- Project → Budget

### 4.6 Roles
Administrator, Sales Manager, Sales Executive, Channel Partner/Broker, Project Manager, Procurement Manager, Site Engineer, Accountant, HR Manager, Customer Service, Customer

### 4.7 Integrations
- Accounting: Tally, SAP, Oracle, QuickBooks, Xero
- Property portals: Magicbricks, 99Acres, CommonFloor, Housing.com, Makaan
- Comms: IVR/virtual number, email, SMS, WhatsApp, Google Workspace, Microsoft 365
- Productivity: Salesforce, Zapier, Dropbox
- Payments: Stripe, bank RTGS/NEFT
- Analytics: Google Analytics, BI tools

### 4.8 Pricing
- Custom/quotation-based. No free trial/plan.
- Factors: modules, users, projects, deployment (cloud vs on-prem), customization, implementation, training, support
- Contact: +91 989 190 6263 / rajeev@4qt.com / info@4qt.com

---

## 5. TALLY (TallyPrime) — COMPLETE MAP

### 5.1 Core Modules (10)

**A. Accounting** — Chart of Accounts (28 pre-defined groups), Ledgers, Voucher Entry, Books & Registers, Financial Statements, Cost Centres & Profit Centres, Budgets & Scenarios, Bill-wise Management, Interest Calculations

**B. Inventory** — Stock Items & Groups, Stock Categories, Godowns, Batch-wise details, Units of Measure, BoM, Price Lists & Levels, Manufacturing Journal, Stock Journal, Physical Stock Verification, Reorder Levels

**C. Sales & Purchase** — Sales Orders, Purchase Orders, Sales Vouchers/Invoices, Purchase Vouchers, Delivery Notes, Receipt Notes, Credit Notes (sales returns), Debit Notes (purchase returns), Rejections In/Out, POS

**D. Payroll** — Employee Masters, Pay Heads, Attendance/Production Vouchers, Salary Processing, Payroll Vouchers, Statutory (PF/ESI/PT/NPS/IT), Pay Slips, Reports

**E. Statutory & Taxation** — GST (GSTR-1/2B/3B, e-Invoicing, e-Way Bill, Composition), TDS, TCS, VAT (GCC), Excise, Service Tax, Professional Tax

**F. Manufacturing** — BoM, Manufacturing Journal, Job Work In/Out, Material In/Out, By-products/Co-products/Scrap

**G. Banking** — Bank Reconciliation (manual + auto import 145+ banks), Cheque Management, Connected Banking, Payment/Receipt/Contra vouchers, Bank Books

**H. Job Work & Consignment** — Job Work Orders, Material Out/In, Consignment Sales, Third-party Godowns

**I. Multi-Location/Branch** — Multiple Godowns, Group Companies, Inter-company transactions, Branch/Division accounting

**J. Reporting & Analytics** — Dashboard, 400+ reports, MIS, Exception reports, Ratio Analysis, Cash Flow Projections

### 5.2 Voucher Types (21 total)

**Accounting (8):** Contra (F4), Payment (F5), Receipt (F6), Journal (F7), Sales (F8), Purchase (F9), Credit Note (Ctrl+F8), Debit Note (Ctrl+F9)

**Inventory (7):** Stock Journal (F7), Physical Stock (F10), Delivery Note (Alt+F8), Receipt Note (Alt+F9), Rejections In, Rejections Out, Material In/Out

**Order (4):** Sales Order, Purchase Order, Job Work In Order, Job Work Out Order

**Payroll (2):** Payroll Voucher (Ctrl+F4), Attendance Voucher

### 5.3 Sales Module Deep Map

**Sales Order Flow:**
1. Enable: F11 > F2 > "Enable sales order processing" = Yes
2. Create customer ledger (Sundry Debtors), stock items (HSN/SAC), sales ledger
3. Gateway of Tally > Inventory Vouchers > Alt+F5 (Sales Order)
4. Fields: Party A/c, Order No, Date, Due Date, Sales Ledger, Item details (qty, rate), supplementary details
5. Options: Use Order No. for items, supplementary details, multiple price levels

**Sales Cycle:**
```
Sales Order → Delivery Note (optional) → Sales Invoice → Receipt
```
OR direct: `Sales Order → Sales Invoice (linked) → Receipt`

**Sales Voucher Modes:**
- Item Invoice Mode (goods, auto-GST, inventory update)
- Accounting Invoice Mode (services, manual GST)
- As Voucher Mode (simple double-entry, no auto-GST)

**Credit Note (Sales Return):**
- Ctrl+F8, Item or Accounting mode
- Reference: Agst Ref (before payment) or New Ref (after payment)
- GST: included in GSTR-1, reduces output tax, reason required

**Price Lists:**
- F11 > F2 > "Use Multiple Price Levels"
- Price levels: Wholesaler, Distributor, Retailer, Export
- Quantity-based slab pricing, discount %, applicable-from date, stock-group-wise

**Discount Types:** Item-level, Invoice-level, Price-list (auto by category), Quantity (slab)

**GST in Sales:**
- Local (intra-state): CGST + SGST (e.g. 9% + 9% = 18%)
- Interstate: IGST (18%)
- Fields: Place of Supply, buyer GSTIN, HSN/SAC, taxable value, GST amount, RCM flag
- Special types: Nil-rated, exempt, SEZ, export, deemed export, B2C, consignee

**TCS on Sales:**
- Section 206C(1H): 0.1% on receipts > ₹50L threshold
- Create TCS ledger (Duties & Taxes), set "Is TCS Applicable" in Sales Ledger

**Sales Reports:**
- Sales Register (monthly summary, drill-down, columnar, profitability, comparative)
- Sales Order Outstanding (by group/category/item/ledger/all — ordered vs undelivered, due date, days overdue)
- Movement Analysis (inward/outward, effective rates, slow-moving, supplier cost comparison)
- Sales Profitability (transaction value, gross revenue, cost, gross profit, margin %)
- Sales Bill-wise Pending, Sales Ageing, Sales Executive-wise, Item/Godown/Batch-wise Sales

### 5.4 Inventory Module Deep Map
- **Stock Groups:** hierarchical, unlimited levels, "should quantities be added" flag
- **Stock Categories:** parallel classification across groups (alternatives/substitutes)
- **Godowns:** unlimited, inter-godown transfers, third-party (consignment/job work)
- **Batches:** mfg date, expiry, batch-wise reports, serial number tracking (IMEI)
- **Stock Items:** name, alias, group, category, units (primary + alternate), std cost/price, HSN/SAC, GST rate, opening balance, reorder level, BoM
- **Units:** primary, alternate, conversion factors, decimal places
- **BoM:** single/multiple, BOM with Type of Item, auto-populates Manufacturing Journal
- **Valuation:** FIFO, Average Cost, LIFO, Standard Cost, Last Purchase Price

### 5.5 Accounting Module Deep Map
- **28 pre-defined groups:** 15 primary (Capital, Current Assets/Liabilities, Fixed Assets, Direct/Indirect Expenses/Income, Investments, Loans Asset/Liability, Suspense, Misc Expenses, Branch/Divisions, P&L) + 13 sub (Bank Accounts, Bank OD, Cash-in-hand, Deposits, Loans & Advances, Sundry Creditors/Debtors, Duties & Taxes, Provisions, Reserves & Surplus, Stock-in-hand, Purchase/Sales Accounts)
- **Cost Centres:** hierarchical, cost categories for parallel allocation, budgets, reports
- **Budgets:** ledger/cost-centre/group-wise, multiple budgets, variance reports

### 5.6 GST & Taxation Full Workflow
1. Company config (F11 > F3): GSTIN, state, enable GST
2. Master config: party GSTIN/state/type, item HSN/SAC/rate, ledger GST applicability
3. Tax ledgers: CGST, SGST/UTGST, IGST, Cess (under Duties & Taxes)
4. Sales invoice → auto GST calc by party state + item rate
5. e-Invoicing (turnover > ₹5cr): IRN generation, QR code, signed invoice, e-Way Bill link
6. e-Way Bill (consignment > ₹50K interstate): number, validity, Part A + Part B
7. GSTR-1 filing (monthly/quarterly): B2B, B2C Large/Small, export, nil-rated, exempt
8. GSTR-3B: summary, tax liability, ITC, auto from GSTR-2B
9. GST reconciliation: books vs portal, missing invoices, ITC recon

### 5.7 Reports (400+)
**Accounting:** Day Book, Sales/Purchase Register, Cash/Bank Book, Journal/Contra/Payment/Receipt Register, Credit/Debit Note Register, Bills Receivable/Payable, Ageing, Outstanding, Interest
**Financial:** Trial Balance, P&L, Balance Sheet, Ratio Analysis, Cash Flow, Funds Flow
**Inventory:** Stock Summary, Item/Group/Category/Godown/Batch Summary, Movement Analysis, Stock Query, Reorder Status, Ageing, Transfers, Physical Stock, Expiry, Cost of Production
**Sales/Purchase:** Order Outstanding, Bill-wise Pending, Profitability, Item/Party/Godown-wise
**GST:** GSTR-1/2B/3B/9, e-Invoice, e-Way Bill, Reconciliation
**Payroll:** Payslips, Payroll Statement, Attendance/Overtime Register, PF/ESI/PT/IT
**Mgmt:** Cost Centre/Category Summary, Budget vs Actual, Scenario, Cash Flow Projection
**Audit:** Tally Audit Listings, Edit Log, Exception Reports

### 5.8 Integration Methods
- **XML (HTTP):** bidirectional, voucher/master import/export, native Tally XML
- **JSON (v3.0+):** bidirectional, modern web/mobile
- **ODBC:** bidirectional, real-time dashboards/Excel/BI
- **TDL (Tally Definition Language):** custom reports, screens, workflows, HTTP actions
- **TallyPrime Developer:** IDE with TDL editor, Connector, Dictionary Manager, API Explorer
- **Import/Export formats:** XML, JSON, Excel, CSV, SDF

### 5.9 Multi-Company / Currency / Branch
- Unlimited companies, Group Company consolidation (consolidated BS/P&L/TB, inter-company elimination)
- Multi-currency: base + foreign, exchange rate maintenance, auto conversion, gain/loss accounting
- Multi-branch: separate companies + Group Co, OR single company + godowns + cost centres, OR Branch/Division groups

### 5.10 Additional Features
- **POS:** barcode, multi-mode payment, quick billing, POS Register
- **Banking:** auto bank statement import (145+ banks), auto-voucher creation, Connected Banking (live balance, payment initiation)
- **Security:** user/password, security levels (Owner/Data Entry/Auditor), TallyVault encryption, Tally Audit, Edit Log (cannot disable)
- **Cloud:** TallyPrime Cloud Access, online report viewer, mobile access, Tally.NET Sync
- **AI (TallyIra):** Docs by Ira — scan/upload → auto-create entries → GST validation → review/approve

---

## 6. ZOHO — COMPLETE MAP

### 6.1 Complete Product List (55+)

**Sales & Marketing:** CRM, Bigin, SalesIQ, Campaigns, Social, Survey, Forms, PageSense, LandingPage, Marketing Automation, Backstage, Thrive
**Finance:** Books, Invoice, Subscriptions (Billing), Expense, Payroll, Checkout
**Inventory & Ops:** Inventory, Commerce, FSM, Procurement
**Support:** Desk, Assist, Lens
**Comms & Collab:** Mail, Cliq, Meeting, ShowTime, Connect, TeamInbox, Sprints, Projects, WorkDrive, Notebook
**HR:** People, Recruit, Workerly
**Docs:** Sign, Writer, Sheet, Show, Docs
**Security/IT:** Vault, Directory, Endpoint Central, Log360, Site24x7
**BI:** Analytics, DataPrep
**Low-Code:** Creator, Flow, Catalyst, Sigma, Vertical Studio
**Utilities:** Bookings, Calendar, Tasks, Sites, Contracts, Orchestly, Learn, ZeptoMail, IoT, Route, BackToWork

### 6.2 Zoho Books (Accounting) — Deep Map

**Modules:** Dashboard, Sales (Invoices, Estimates, Sales Orders, Credit Notes, Recurring Invoices, Customers), Purchases (Bills, POs, Vendor Credits, Recurring Bills, Vendors), Items (Items, Price Lists, Item Groups), Banking (Accounts, Credit Cards, Feeds, Rules, Transfers), Projects (Projects, Timesheets, Project Invoicing), Expenses (Expenses, Claims), Taxes (Taxes, Exemptions), Reports (50+), Settings (Org Profile, Users & Roles, Preferences, Custom Modules, Workflows, Automation)

**Flows:**
- Invoice: Quote → Sales Order → Invoice → Payment → Credit Note
- Purchase: PO → Goods Received → Bill → Payment
- Expense: Entry → Approval → Reimbursement
- Project: Setup → Timesheet → Project Invoice
- Bank Recon: Import Feed → Match → Reconcile

**Logic:** Multi-level approvals, workflow rules, custom functions (Deluge), validation rules, blueprints, auto tax calc by location/item

**Reports:** Sales by Customer/Item/SalesPerson, A/R Aging, Invoice Details, Overdue, A/P Aging, Bill Details, Vendor Payments, Cash Flow, Funds Flow, Inventory Summary/Valuation, Stock Summary, Tax Summary, GST, 1099, Project Profitability, Timesheet, Expense, Reimbursement

### 6.3 Zoho Inventory — Deep Map

**Modules:** Dashboard, Items (Items, Item Groups, Composite Items, Price Lists), Sales (Sales Orders, Invoices, Packages, Shipments, Returns), Purchases (POs, Packages Received, Returns), Inventory (Stock Adjustments, Stock Transfer, Physical Inventory), Warehousing (Warehouses, Bins), Reports, Settings

**Flows:**
- Sales: SO → Pick → Pack → Ship → Invoice
- Purchase: PO → Receive → Stock In
- Transfer: Warehouse A → B
- Adjustment: Increase/Decrease
- Assembly: Composite Items → Component Consumption

**Logic:** FIFO/LIFO/Weighted Average, serial number tracking, batch tracking, barcode gen, low stock alerts, reorder points (auto PO), workflow rules, Deluge

**Reports:** Inventory Summary, Valuation, Stock Summary, SO/PO Summary, FIFO Cost Lot, ABC Classification, Slow Moving, Stock Aging

**Integrations:** Zoho Books (accounting sync), CRM (sales order), Commerce (e-commerce), Projects (material tracking), FedEx/UPS/DHL/USPS, Amazon/eBay/Etsy/Shopify, Stripe/PayPal

### 6.4 Zoho CRM — Deep Map

**Modules:** Home (pipeline dashboard), Leads, Accounts, Contacts, Deals (Potentials), Campaigns, Tasks, Events, Calls, Products, Price Books, Quotes, Invoices, Sales Orders, Vendors, Purchase Orders, Cases, Solutions, Forecasts, Activities, Custom Modules

**Flows:**
- Lead: Lead → Qualify → Convert to Contact/Account/Deal
- Pipeline: Deal → Stages (Qualification → Proposal → Negotiation → Close)
- Quote to Order: Quote → Sales Order → Invoice
- Case: Case → Assignment → Resolution → Closure
- Campaign: Campaign → Leads → Conversion Tracking

**Logic:** Assignment rules, escalation rules, validation rules, workflow rules, blueprints, layout rules, webhooks, custom functions (Deluge)

**Data Model:** Accounts → Contacts/Deals/Cases; Contacts → Deals; Leads → Converted Contact; Deals → Quotes → Sales Order → Invoice; Products → Price Books; Campaigns → Leads

**Reports:** Pipeline Analysis, Lead Conversion, Win/Loss, Sales by Territory, Forecast, Activity, Campaign ROI, Case Analysis, Custom

### 6.5 Zoho Projects — Deep Map

**Modules:** Overview, Tasks (with subtasks), Milestones, Task Lists, Issues, Forums, Documents, Pages, Timesheets, Gantt Chart, Calendar, Reports, Custom Modules

**Flows:** Project Setup (Create → Tasks → Resources → Timeline), Task Execution (Assign → Progress → Complete → Timesheet), Issue Resolution (Log → Assign → Fix → Verify → Close), Approval (Submit → Approve/Reject)

**Logic:** Task dependencies (predecessor/successor), workflow rules, blueprints, Deluge, validation, recurring tasks, task templates

**Reports:** Gantt, Milestone Gantt, Task Summary, Resource Usage, Timesheet Summary, Issue Summary, Project Status, Custom

### 6.6 Zoho Expense — Deep Map

**Modules:** Dashboard, Expenses, Reports, Advances, Trips, Per Diem, Purchase Orders, Policies, Approvals, Settings

**Flows:** Expense (Create → Attach Receipt → Submit to Report → Approve → Reimburse), Advance (Request → Approve → Receive → Adjust), Per Diem (Create Trip → Set Rates → Auto-calc), PO (Create → Approve → Receive → Invoice)

**Logic:** Expense policies (spending limits), multi-level approvals, workflow rules, Deluge, validation, OCR receipt scanning

### 6.7 Zoho Payroll — Deep Map

**Modules:** Dashboard, Employees, Salary Components, Pay Runs, Salary Revisions, Loans, Timesheets, Leave, Attendance, Forms, Reports, Settings

**Flows:** Payroll (Add Employees → Set Salary → Run Pay Run → Payslips → Disburse), Salary Revision (Request → Approve → Update → Effective Date), Loan (Request → Approve → Disburse → Deduct), Leave (Request → Approve → Balance → Adjust)

### 6.8 Zoho Creator — Low-Code

**Modules:** Application Builder, Forms, Pages, Reports, Workflows, Deluge Scripting, APIs, Integration, Mobile App Builder

**Flows:** App Dev (Create Form → Fields → Layout → Workflow → Deploy), Data (Submit → Validate → Workflow → DB → Notify), Integration (External API → Map → Transform → Store)

**Logic:** Deluge scripting, workflow rules, schedules, blueprints, custom functions, validation, form rules

**Reports:** 50+ chart types, pivot tables, cross-tab, summary, Kanban, calendar

**Integrations:** All Zoho apps native, 600+ third-party (Google, Salesforce, SAP), SQL/NoSQL, REST/SOAP, webhooks

### 6.9 Zoho One (All-in-One)
- **Included:** 50+ apps across Sales, Marketing, Support, Comms, Collab, Finance, HR, BI, Low-Code, Operations
- **Pricing:** Essentials ~$15/user/mo (15+ apps); Standard Flexible $90/user/mo (50+ apps, specific users); Standard All-Employee $37/user/mo (50+ apps, all employees)
- **Connection:** Unified Admin Console (SSO), cross-app native integration, unified data (shared customer/vendor/item), unified reporting, Zoho Directory (identity), Zoho Flow (cross-app workflows)

### 6.10 Integration Architecture
- **Zoho Flow:** 1000+ connectors, visual workflow builder, triggers (event/schedule/webhook), actions (CRUD + notify), webhooks (in/out), hybrid (on-prem agent), logic elements (conditions/loops/delays/variables)
- **REST APIs:** every app, OAuth 2.0, SDKs (Java/Python/Node/PHP/.NET/Ruby), webhooks, rate limits by plan
- **Deluge:** in-app scripting, cross-app API calls, external API calls, data manipulation
- **Data Sync:** native sync between Zoho apps, custom field mapping, near real-time, bulk import/export

### 6.11 Roles & Permissions
- **RBAC:** Roles (what you can do), Profiles (what you can see), Groups (organization)
- **Standard roles:** Super Admin, Admin, Standard User, Viewer
- **Permission levels:** Module (View/Create/Edit/Delete/Import/Export), Field (View/Edit), Record (View/Edit/Delete), API (scopes)
- **Data access:** Hierarchy-based, Territory-based, Shared records, Private records

### 6.12 Mobile
- Zoho One unified app (all apps, admin console, push notifications, offline mode, biometric login)
- Individual native iOS/Android apps per product
- Progressive Web Apps

### 6.13 Zoho for Construction/Real Estate (recommended stack)
- CRM (leads/deals), Projects (project mgmt), Books (accounting/invoicing/project accounting), Inventory (material tracking), Expense (expense/per diem), FSM (field service), Creator (custom construction apps), Sign (contracts), WorkDrive (documents), Analytics (BI)
- Industry-specific via Creator templates + custom modules

---

## 7. SALES / "SALE CALLING" DEEP DIVE

### What "Sale Calling" Means
- **NOT a Tally feature.** "Tally calling" = outbound sales calls to sell Tally software (job descriptions for telecalling roles at Tally Solutions / partners).
- In business/ERP context, the equivalent processes are:
  - **Sales Order Booking** (recording customer orders)
  - **Order Calling** (converting orders to invoices)
  - **Stock Allocation** (reserving stock for orders)
  - **Follow-up Calls** (tracking order status via reports)

### Sales Order Processing Comparison

| Step | 4QT | Tally | Zoho |
|---|---|---|---|
| **Order creation** | Booking management (property allotment) | Sales Order voucher (Alt+F5) | Sales Order in Books/Inventory |
| **Stock reservation** | Inventory status / double-booking prevention | Order tracking (no stock hold unless tracking numbers) | Pick list generation, stock commitment |
| **Delivery** | Possession handover | Delivery Note (Alt+F8) | Shipment / Package creation |
| **Invoicing** | Demand notice + payment receipt | Sales Invoice (F8), linked to order | Invoice, linked to SO |
| **Payment** | Payment collection + receipt | Receipt voucher (F6), bill-wise | Payment received, linked to invoice |
| **Returns** | Cancellation/surrender workflow | Credit Note (Ctrl+F8), Agst/New Ref | Credit Note in Books/Inventory |
| **Outstanding tracking** | Aging reports, recovery mgmt | Sales Order Outstanding, Bill-wise Pending | A/R Aging, Overdue Invoices |
| **Pricing** | Project/unit pricing + broker commission | Price Lists + Price Levels (wholesaler/distributor/retailer) | Price Lists per customer |
| **Discounts** | Negotiation tracking | Item-level, invoice-level, price-list, quantity slab | Item-level, invoice-level, price-list |
| **GST** | GST compliance built-in | CGST/SGST/IGST auto by party state + item HSN | Auto tax by location/item |
| **TCS** | — | Section 206C(1H) 0.1% > ₹50L | Configurable tax |
| **Reports** | Booking/collection reports (D/W/M/Y/til-date) | Sales Register, Order Outstanding, Movement Analysis, Profitability | Sales by Customer/Item/SalesPerson, A/R Aging |

### Sales Flow Logic (cross-platform)
```
Lead/Enquiry → Quotation → Sales Order → [Delivery Note] → Invoice → Payment → [Credit Note if return]
                                                                    ↓
                                                            Outstanding Tracking → Aging → Recovery
```

---

## 8. PROCUREMENT & INVENTORY DEEP DIVE

| Dimension | 4QT | Tally | Zoho Inventory |
|---|---|---|---|
| **Requisition** | Indent → approval → budget check | Purchase Order (Ctrl+F9 other) | PO in Inventory/Books |
| **Quote comparison** | Quote mgmt + vendor comparison + bid analysis | Manual (no native quote comparison) | Manual (no native comparative quotes) |
| **PO** | PO generation → approval → sent | Purchase Order voucher | PO creation |
| **Receipt** | GRN → QC → qty verify → stock update | Receipt Note (Alt+F9) | Packages Received |
| **3-way matching** | PO vs GRN vs Invoice with tolerance | Manual | Manual |
| **Issue** | Material issue → stock deduction → cost allocation | Stock Journal (F7) | Stock Adjustment |
| **Return** | Return → credit note → stock adjust | Rejections Out / Debit Note | Purchase Return |
| **Reorder** | Reorder point + EOQ + safety stock + lead time | Reorder Levels (F11 > F2) | Low stock alerts + auto PO |
| **Multi-location** | Project/site + warehouse | Godowns (unlimited, inter-godown transfer, third-party) | Warehouses + Bins |
| **Batch/Serial** | — | Batch-wise (mfg/exp) + serial (IMEI) | Serial + Batch tracking |
| **Valuation** | — | FIFO / Avg / LIFO / Std Cost / Last Purchase | FIFO / LIFO / Weighted Avg |
| **BoM/Manufacturing** | — | BoM + Manufacturing Journal + Job Work + Scrap | Composite Items (bundles) |
| **QC** | Quality check + inspection + reports | — | — |
| **Supplier Portal** | Supplier dashboard + performance + relationship | — | — |
| **Vendor Evaluation** | On-time + quality + price → rating | Movement Analysis (supplier cost comparison) | — |

---

## 9. ACCOUNTING / GL DEEP DIVE

| Dimension | 4QT | Tally | Zoho Books |
|---|---|---|---|
| **Chart of Accounts** | Built-in (project-wise tracking) | 28 pre-defined groups + custom | Custom groups + ledgers |
| **Voucher types** | Built-in transaction types | 21 pre-defined + custom | Invoice/Bill/Journal/Payment/Receipt/Credit/Debit Note |
| **Cost Centres** | Project-wise financial tracking | Cost Centres + Cost Categories (parallel) | Projects + tracking categories |
| **Budgets** | Budget forecasting | Ledger/Cost Centre/Group-wise + variance | Budgets vs actuals |
| **Bank Recon** | Built-in | Manual + auto import (145+ banks) + Connected Banking | Bank feeds + auto-match + rules |
| **Multi-currency** | — | Full (base + foreign, exchange gain/loss) | Full |
| **Multi-company** | Multi-company, multi-project | Unlimited + Group Company consolidation | Multi-org |
| **GST** | Built-in compliance | Gold standard (GSTR-1/2B/3B/9, e-Invoice, e-Way Bill, recon) | GST + e-Invoicing + GSTR reports |
| **TDS/TCS** | TDS reports | Full TDS + TCS (206C(1H)) | TDS + TCS |
| **Reports** | P&L, BS, Cash Flow, TB, project P&L | 400+ (TB, P&L, BS, Ratio, Cash/Funds Flow, Day Book, all registers) | 50+ (Sales by X, A/R-A/P Aging, Cash Flow, Inventory, Tax, Project) |
| **Audit** | Audit trails | Tally Audit + Edit Log (cannot disable) + digital signature | Audit log |
| **Interest Calc** | Delayed payment interest (configurable rate) | Built-in interest calculation | — |
| **Bill-wise** | Outstanding tracking | Bill-wise management (Agst Ref / New Ref / Advance) | Bill tracking |

---

## 10. CONSTRUCTION / PROJECT MANAGEMENT DEEP DIVE

| Dimension | 4QT | Tally | Zoho Projects |
|---|---|---|---|
| **BOQ** | ✅ Built-in (core) | ❌ | ❌ |
| **Rate Analysis** | ✅ Built-in | ❌ | ❌ |
| **Estimation** | ✅ Built-in | ❌ | ❌ |
| **Project Costing** | ✅ Built-in (budget vs actual) | ⚠️ Cost centres only | ⚠️ Via Books projects |
| **WBS/Stages/Tasks** | ✅ Built-in | ❌ | ✅ Tasks + Task Lists + Milestones |
| **Scheduling** | ✅ Gantt + milestones + critical path | ❌ | ✅ Gantt + dependencies |
| **DPR** | ✅ Built-in (core) | ❌ | ❌ (needs Creator) |
| **Contractor/Work Order** | ✅ Built-in | ⚠️ Job Work | ❌ (needs Creator) |
| **Change Order** | ✅ Built-in (impact analysis) | ❌ | ❌ |
| **Resource Mgmt** | ✅ Allocation + scheduling + availability | ❌ | ✅ Resource allocation + utilization |
| **Equipment Mgmt** | ✅ Tracking + scheduling + maintenance + cost | ❌ | ❌ |
| **Time Tracking** | ✅ Labor + equipment + timesheets | ❌ | ✅ Timesheets |
| **Quality Control** | ✅ Checklists + inspections + NCR + CAPA | ❌ | ❌ |
| **Safety Mgmt** | ✅ Checklists + incidents + compliance | ❌ | ❌ |
| **Document Mgmt** | ✅ Repository + versioning + approval + sharing | ❌ | ✅ Documents + Pages (wiki) |
| **EVM** | ✅ PV/EV/AC/SPI/CPI/EAC | ❌ | ❌ |
| **Critical Path** | ✅ ES/EF/LS/LF + slack/float | ❌ | ⚠️ Dependencies only |

**4QT is the only platform with true construction-industry depth.** Tally and Zoho require significant customization (TDL / Creator) to match.

---

## 11. CRM / LEAD MANAGEMENT DEEP DIVE

| Dimension | 4QT | Tally | Zoho CRM |
|---|---|---|---|
| **Lead capture** | Web/portal/IVR/social/chatbot/phone | ❌ | Web forms, social, email, chat (SalesIQ) |
| **Lead scoring** | ✅ Auto (engagement + source + budget + timeline) | ❌ | ✅ Auto + manual scoring |
| **Lead assignment** | Auto + territory + round-robin | ❌ | Assignment rules (criteria-based) |
| **Lead nurturing** | Email/SMS campaigns + follow-ups | ❌ | Campaigns + workflows + blueprints |
| **Pipeline** | Lead → Contacted → Qualified → Converted → Lost | ❌ | Custom pipeline stages |
| **Conversion** | Lead → Booking (property allotment) | ❌ | Lead → Contact/Account/Deal |
| **Property portal integration** | ✅ Magicbricks/99Acres/CommonFloor/Housing/Makaan | ❌ | ❌ (needs custom integration) |
| **Broker/Channel Partner** | ✅ Portal + commission + performance | ❌ | ⚠️ Partner portal (limited) |
| **Reports** | Source, conversion, aging, funnel, ROI, campaign | ❌ | Pipeline, conversion, win/loss, territory, forecast, campaign ROI |

---

## 12. HR / PAYROLL DEEP DIVE

| Dimension | 4QT | Tally | Zoho People + Payroll |
|---|---|---|---|
| **Employee mgmt** | Onboarding + profiles + records + org structure | Employee Masters | Employee mgmt |
| **Attendance** | Tracking + leave + shifts + biometric | Attendance/Production Vouchers | Attendance + leave + shifts |
| **Payroll** | Processing + salary calc + deductions + payslips | Pay Heads + Payroll Voucher + Salary Processing | Salary Components + Pay Runs + Payslips |
| **Statutory** | PF/ESI + tax | PF/ESI/PT/NPS/IT | Statutory compliance |
| **Performance** | Reviews + goals + appraisals | ❌ | ⚠️ Via People |
| **Recruitment** | Resource planning + recruitment + training | ❌ | Zoho Recruit (separate) |
| **GPS attendance** | ✅ (implied by biometric + mobile) | ❌ | ✅ Zoho People (GPS) |
| **Reports** | Employee master, attendance, leave, OT, payroll, salary register, PF/ESI, TDS, performance, manpower | Payslips, payroll statement, attendance/OT register, PF/ESI/PT/IT | Payroll summary, pay register, salary register, payslip, tax, contribution, loan, leave |

---

## 13. REPORTS COMPARISON

| Category | 4QT | Tally | Zoho |
|---|---|---|---|
| **Total reports** | ~60-80 (module-wise) | 400+ | 50+ per app (500+ across suite) |
| **Sales** | Booking (D/W/M/Y/til-date), collection, project-wise, unit-type-wise, location-wise, broker-wise | Sales Register, Order Outstanding, Movement Analysis, Profitability, Bill-wise Pending, Ageing, Executive-wise, Item/Godown/Batch-wise | Sales by Customer/Item/SalesPerson, A/R Aging, Invoice Details, Overdue |
| **Procurement** | PO, material consumption, inventory valuation, stock, vendor performance, issue, return, cost variance | Purchase Register, PO Outstanding, Movement Analysis, Stock Summary, Reorder Status, Ageing | PO Summary, Inventory Summary/Valuation, Stock Aging, ABC, Slow Moving |
| **Project** | Cost variance (budget vs actual), project cost, work order, contractor bill, progress (DPR), stage-wise progress, task completion, resource/equipment utilization, delay analysis | Cost Centre Summary, Budget vs Actual | Gantt, Task Summary, Resource Usage, Timesheet, Project Status |
| **Finance** | TB, P&L, BS, Cash Flow, Fund Flow, debtors, creditors, BRS, ageing, GST, TDS, project P&L, cost center, budget vs actual | TB, P&L, BS, Ratio Analysis, Cash Flow, Funds Flow, Day Book, all registers, Bills R/P, Ageing, Interest, GST (GSTR-1/2B/3B/9), TDS, TCS | Sales by X, A/R-A/P Aging, Cash Flow, Funds Flow, Inventory, Tax, GST, 1099, Project Profitability, Timesheet, Expense |
| **HR** | Employee master, attendance, leave, OT, payroll, salary register, PF/ESI, TDS, performance, manpower, dept headcount | Payslips, payroll statement, attendance/OT, PF/ESI/PT/IT | Payroll summary, pay/salary register, payslip, tax, contribution, loan, leave |
| **Dashboards** | Executive, sales, project, procurement, HR, finance, customer service | Dashboard + ratio analysis + cash flow projection | Per-app dashboards + Zoho Analytics (cross-app) |
| **Custom reports** | ✅ Customizable | ✅ TDL custom reports | ✅ Custom reports + Zoho Analytics |

---

## 14. INTEGRATIONS & APIs

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **API style** | REST/GraphQL (undocumented) | XML (HTTP), JSON (v3+), ODBC | REST per app, OAuth2 |
| **SDKs** | ❌ | ❌ | Java/Python/Node/PHP/.NET/Ruby |
| **Webhooks** | ⚠️ | ⚠️ TDL HTTP actions | ✅ Full webhook support |
| **Workflow automation** | Built-in | TDL | Zoho Flow (1000+ connectors) + Deluge |
| **Accounting sync** | Exports to Tally/SAP/Oracle/QB/Xero | — (is the accounting system) | Native between Zoho apps |
| **Property portals** | Magicbricks/99Acres/CommonFloor/Housing/Makaan | ❌ | ❌ |
| **Comms** | IVR, email, SMS, WhatsApp | ❌ | Campaigns, Cliq, SalesIQ |
| **Payments** | Stripe, bank RTGS/NEFT | Connected Banking (live) | Stripe, PayPal, Square, Authorize.net |
| **Shipping** | ❌ | ❌ | FedEx/UPS/DHL/USPS |
| **Marketplaces** | ❌ | ❌ | Amazon/eBay/Etsy/Shopify |
| **Doc storage** | Built-in DMS | TallyDrive | WorkDrive, Google Drive, Dropbox, Box |
| **E-sign** | ⚠️ Doc gen only | ❌ | Zoho Sign |
| **BI** | Basic dashboards | 400+ built-in reports | Zoho Analytics (cross-app BI) |
| **Low-code custom** | ❌ | TDL | Zoho Creator + Deluge |

---

## 15. ROLES & PERMISSIONS

| Dimension | 4QT | Tally | Zoho |
|---|---|---|---|
| **Roles** | 11 defined (Admin, Sales Mgr, Sales Exec, Channel Partner, PM, Procurement Mgr, Site Engineer, Accountant, HR Mgr, Customer Service, Customer) | 3 security levels (Owner, Data Entry, Auditor) + custom | Super Admin, Admin, Standard User, Viewer + custom roles |
| **Module perms** | View/Create/Edit/Delete/Approve/Export/Report | Allow/Disallow facilities | View/Create/Edit/Delete/Import/Export |
| **Data perms** | Territory + project + department + own-data | User-wise + Tally audit | Hierarchy + territory + shared + private |
| **Field perms** | Sensitive field hiding + read-only + mandatory | — | Field-level security (View/Edit) |
| **API perms** | — | — | OAuth2 scopes |
| **Audit** | Audit trails | Tally audit + Edit Log (immutable) | Audit log per app |

---

## 16. PRICING COMPARISON

| Platform | Model | Entry | Mid | Enterprise |
|---|---|---|---|---|
| **4QT** | Custom quote (modules + users + projects + deployment) | Contact vendor | Contact vendor | Contact vendor |
| **TallyPrime** | One-time license + AMC | TallyPrime Silver (single user) ~₹22,500 + GST | TallyPrime Gold (multi-user) ~₹67,500 + GST | TallyPrime Cloud subscription |
| **Zoho One** | Per-user subscription (annual) | Essentials ~$15/user/mo (15+ apps) | Standard All-Employee $37/user/mo (50+ apps) | Standard Flexible $90/user/mo (50+ apps) |
| **Zoho (individual)** | Per-app per-user or per-org | Free tiers available (CRM 3 users, Books <$50K rev, Inventory 50 orders/mo, Projects 3 users, Expense 3 users) | Standard $14-39, Professional $23-79 | Enterprise $40-129 |

---

## 17. GAP ANALYSIS vs NIRMAN INVENTORY OS

Based on the AGENTS.md, Nirman already has strong coverage. Here's what each platform reveals as potential gaps or inspirations:

### What Nirman ALREADY has (better than or equal to all three)
- ✅ Stock ledger with immutable StockMovement + MAC (better than Tally/Zoho)
- ✅ Cost-per-sqft allocation + per-unit issuance (4QT-level, better than Tally/Zoho)
- ✅ Comparative Quote Engine with ≥3 quotes + cheapest flagging + waiver (better than Tally, matches 4QT)
- ✅ Purchaser Performance Report (unique — not in any of the three)
- ✅ Auto-requisition (EOQ + reorderPoint) (matches Tally reorder + Zoho auto-PO)
- ✅ DPR Multi-Tier Approval (SUBMITTED → SUB_ADMIN → APPROVED) (better than 4QT's single-tier)
- ✅ Standard Consumption Benchmarks + Auto-Scrap from DPR variance (unique — not in any)
- ✅ Tally XML voucher integration (matches Tally's native XML)
- ✅ WhatsApp/Notification alerts with templates (matches 4QT, better than Tally)
- ✅ GPS-tagged attendance (matches Zoho People, better than Tally)
- ✅ 13-role RBAC with 5-tier delegation (more granular than all three)
- ✅ GL + GST with 26 system accounts + balanced double-entry (matches Tally)
- ✅ Soft deletes on masters (good practice)
- ✅ Audit logging on every mutation (matches Tally Edit Log)

### Potential GAPS / Inspirations from research

#### From 4QT (vertical real-estate features Nirman may be missing)
1. **Lead Management / Pre-Sales CRM** — lead capture from property portals (Magicbricks/99Acres/CommonFloor), lead scoring, IVR/virtual number, channel partner portal
2. **Booking → Allotment → Possession lifecycle** — customer application, KYC, double-booking prevention, allotment letter, welcome letter
3. **Payment Schedule + Demand Notices** — stage-wise payment schedule tied to construction progress, auto demand notice generation, payment reminders (pre-due/due/post-due)
4. **Document Generation** — sale agreements, construction agreements, bank tri-partite, sale deed, NOC (Nirman has some doc gen but may not have all these templates)
5. **Broker / Channel Partner Management** — broker registration, slab-based commission, performance tracking, channel partner portal
6. **Customer Portal** — self-service for payment status, documents, progress updates, KYC
7. **Post-Sales Customer Care** — trouble tickets, complaint resolution, SLA, possession handover checklists
8. **Lease / Rental Management** — lease agreements, rent collection, lease audits, utility/bill management
9. **Facilities / Mall Management** — asset maintenance, work orders, preventive maintenance, space planning
10. **Cancellation / Transfer / Surrender** — cancellation fee + refund calc, transfer fee + approval, family vs third-party rules
11. **Interest Calculation on delayed payments** — configurable rate per project, compound vs simple
12. **Change Order Management** — creation, impact analysis, approval, budget revision
13. **Bid Management** — RFQ, bid analysis, comparison, award (Nirman has quote comparison but may not have full bid mgmt)
14. **Equipment Management** — tracking, scheduling, maintenance, cost (Nirman has equipment module — verify depth)
15. **Safety Management** — checklists, incident reporting, compliance tracking
16. **EVM (Earned Value Management)** — PV/EV/AC/SPI/CPI/EAC (Nirman has DPR but may not have EVM)
17. **Critical Path Analysis** — ES/EF/LS/LF, slack/float (Nirman has tasks but may not have CPM)

#### From Tally (accounting/GST features to verify Nirman matches)
1. **e-Invoicing** — IRN generation, QR code, signed invoice (Nirman has GL+GST but verify e-Invoice)
2. **e-Way Bill** — generation, Part A/B, validity, extension (verify Nirman has this)
3. **GSTR-1/2B/3B/9 filing** — direct upload to GST portal (Nirman has GST calc but verify filing)
4. **TCS on Sales** — Section 206C(1H) 0.1% > ₹50L (verify Nirman handles TCS)
5. **TDS** — section-wise calculation, threshold, challan, returns (verify Nirman has TDS)
6. **Bank Reconciliation** — auto import from 145+ banks, auto-voucher creation, Connected Banking (verify Nirman has BRS)
7. **Price Lists + Price Levels** — wholesaler/distributor/retailer pricing, quantity-based slabs (Nirman has material pricing but verify multi-level price lists)
8. **Bill-wise Management** — Agst Ref / New Ref / Advance allocation (verify Nirman has bill-wise)
9. **Cost Centres + Cost Categories** — parallel cost allocation (Nirman has project-wise but verify parallel categories)
10. **Multi-currency** — exchange rate, gain/loss (verify Nirman supports multi-currency)
11. **Group Company consolidation** — consolidated BS/P&L/TB across companies (verify Nirman has consolidation)
12. **Interest Calculation** — built-in on dues (Nirman may need this for customer dues)
13. **Job Work** — material in/out, job work orders, third-party tracking (verify Nirman has job work)
14. **Manufacturing/BoM** — BoM + Manufacturing Journal + by-products/co-products/scrap (Nirman has scrap but verify BoM/manufacturing)
15. **POS** — barcode, multi-mode payment, quick billing (likely not needed for construction but noted)

#### From Zoho (UX/integration/architecture patterns to adopt)
1. **Zoho Flow-style integration platform** — visual workflow builder across apps (Nirman could build a similar internal workflow engine)
2. **Blueprints** — visual process automation with stage gates (Nirman has approval flows but could add visual blueprints)
3. **Deluge-style custom scripting** — let users write custom logic (Nirman could add a scripting/rules engine)
4. **Zoho Creator-style low-code** — let users build custom forms/reports (Nirman could add custom module builder)
5. **Zoho Analytics-style cross-app BI** — unified dashboards across all modules (Nirman has per-module dashboards but could unify)
6. **OCR receipt scanning** (Zoho Expense) — auto-extract data from receipt photos (Nirman could add for expense/invoice scanning)
7. **Connected Banking** — live bank balance, payment initiation from ERP (Nirman could integrate)
8. **Customer Portal** — self-service (Nirman could build a customer portal for property buyers)
9. **Channel Partner Portal** — for brokers (Nirman could build)
10. **Mobile-first field access** — offline mode, biometric login (Nirman has mobile but verify offline)
11. **Territory-based data access** — in addition to role-based (Nirman has role-based but could add territory)
12. **Field-level security** — hide sensitive fields per role (Nirman has RBAC but verify field-level)
13. **Webhooks** — outgoing webhooks for external system triggers (verify Nirman has webhooks)
14. **OAuth2 API scopes** — granular API access (verify Nirman's API auth)
15. **Recurring invoices/bills** — automated recurring billing (Nirman may need for lease/rent)

### Priority Recommendations (if refining Nirman to match all three)

**HIGH PRIORITY (core real-estate ERP gaps from 4QT):**
1. Lead Management + property portal integration
2. Booking → Allotment → Possession lifecycle
3. Payment Schedule + Demand Notices + interest calc
4. Broker/Channel Partner Management + portal
5. Customer Portal (self-service)
6. Post-Sales Customer Care (trouble tickets)
7. Cancellation/Transfer/Surrender workflows
8. Document Generation (sale deed, tri-partite, NOC)

**MEDIUM PRIORITY (accounting compliance from Tally):**
9. e-Invoicing (IRN + QR code)
10. e-Way Bill generation
11. GSTR-1/3B filing support
12. TDS + TCS handling
13. Bank Reconciliation (auto-import)
14. Multi-currency support
15. Bill-wise allocation (Agst/New Ref/Advance)
16. Price Lists + Price Levels

**MEDIUM PRIORITY (construction depth from 4QT):**
17. Change Order Management
18. Equipment Management (full depth)
19. Safety Management
20. EVM (Earned Value Management)
21. Critical Path Analysis
22. Lease/Rental Management
23. Facilities Management

**LOWER PRIORITY (UX/architecture from Zoho):**
24. Visual Blueprint/workflow builder
25. Custom scripting/rules engine
26. Low-code custom module builder
27. Cross-app unified analytics
28. OCR receipt scanning
29. Connected Banking
30. Outgoing webhooks
31. Field-level security
32. Offline mobile mode

---

## 18. NIRMAN INTEGRATION BLUEPRINT

### 18.1 Product Principle

Nirman will not reproduce the competitors' page structures. Their capabilities are treated as a feature library and placed at the moment a user needs them. The product remains organized around the existing four-world lifecycle:

`Today → Build (Acquire → Procure → Stock → Construct → Sell) → People → Books`

A capability is placed using this order of preference:

1. **Background automation** when no decision is required.
2. **Contextual action/dialog** for a short task on the current entity.
3. **Detail drawer/tab** for a durable aspect of an entity.
4. **Existing workspace tab** for a recurring list or queue.
5. **New destination page** only when the capability is a distinct daily workspace or serves an external user.

### 18.2 Corrected Current-State Audit

The earlier gap list was based primarily on competitor research. A code-level audit shows that several apparent gaps are already implemented:

| Capability | Verified Nirman state | Placement |
|---|---|---|
| EVM + critical path | Implemented: PV/EV/AC/CPI/SPI/EAC/VAC, ES/EF/LS/LF and float | Project Control and WBS |
| Payment plans | Implemented: CLP/TLP/DPP with WBS milestone linking | Sales detail; exposure needs improvement |
| Rentals | Implemented: tenancy lifecycle, overlap guard, deposits, GST and GL | Rentals workspace |
| Equipment | Implemented: assignment, return, maintenance, retirement and depreciation | Equipment workspace |
| Bid/quote comparison | Implemented beyond competitor baseline: per-piece landed cost, ≥3 quote gate, approval override | Quotations and requisition conversion |
| Three-way matching | Implemented: supplier invoice ↔ PO ↔ GRN | Procurement |
| GST reports | GSTR-1 and GSTR-3B generation exist; filing/e-invoice/e-way bill remain gaps | Books → GST |
| TDS | Implemented for subcontractor RA bills and certificates; wider section coverage remains | Work Orders and Books |
| Offline field receiving | PWA queue and barcode receiving exist; broader offline parity remains | GRN / Receive |
| Portal listing sync | Implemented outbound listing and automatic delisting | Built Units tabs |
| Workflow/task engine | Workflow models and a rich task execution drawer exist | Today / Settings |

The highest-value gaps are therefore **workflow completeness and exposure**, not basic module creation.

### 18.3 Compact Workspace Map

#### Build → Acquire
- **Land** remains the land bank and partition workspace.
- **Suppliers** owns vendor master, ratings, bid history, documents and balances.
- **Rate Contracts** remains a separate destination because it is a recurring procurement workspace.
- New facilities vendors, brokers and service providers should be typed parties inside existing party workspaces, not separate navigation links.

#### Build → Procure
- **Material Indents**: demand, approval, stock snapshot, routing recommendation.
- **Quotations**: RFQ, quote upload, comparative landed cost, commercial terms and award.
- **Purchase Orders**: order, approval, supplier invoice and three-way match.
- **GRN / Receive**: delivery, QC, batch/serial capture, e-way bill context and gate entry.
- **Purchase Returns**: return, debit note and stock reversal.
- Supplier portal is a separate external surface, not an internal navigation module.

#### Build → Stock
- **Stock Ledger** remains the single stock workspace with URL-addressable On Hand, Movements, Transfers, Issues, Scrap and Counts tabs.
- Serial tracking appears during GRN, transfer, issue and equipment warranty flows—not as a page.
- BoM appears on Material detail and manufacturing is a contextual action that posts a manufacturing journal.
- Price lists belong on Material detail and customer pricing appears while quoting/selling.

#### Build → Construct
- **Projects** is the project cockpit. Its detail surface owns Overview, BOQ, WBS, Costs, Units, Documents, Quality, Safety, Change Orders and Activity.
- BOQ/WBS/MB remain focused execution destinations because site and QS users work in them daily.
- EVM, cost overrun, commitments and take-off are project-control tabs/reports, not additional navigation links.
- NCR/CAPA, safety incidents and change orders enter from DPR/MB/Work Order context and aggregate on Project detail.

#### Build → Sell
- **Built Units** owns inventory, valuation, renovations and portal listings.
- **Sales** becomes one continuous commercial workspace:
  - `Pipeline` — leads, calls, follow-ups, site visits and qualification.
  - `Bookings` — reservation/deposit, allotment, payment plan and collection.
  - `Customers` — customer/KYC master and relationship history.
- A sale detail drawer owns Overview, Payment Plan, Documents, Registration, Possession, Support and Activity.
- Cancellation, transfer and surrender are actions on a sale, routed into the common Approvals queue when policy requires approval.
- Broker attribution and commission are captured during lead/booking work; the external channel-partner portal is a separate surface.
- Customer self-service is a separate external surface because its identity and permissions differ from staff.

#### People
- **Employees** owns profile, assignment, compensation, goals, reviews, training and documents.
- **Attendance** owns shifts, leave and biometric/GPS evidence.
- **DPR** is the field execution surface; safety incidents, quality exceptions and consumption variance are captured inline.
- **Payroll** owns salary runs, statutory deductions, payslips and payment.
- Recruitment is justified as a workspace only when applicant volume requires a daily queue; until then it belongs in an Employees tab.

#### Books
- **Cash & Expenses** gains bank feeds/reconciliation as a URL-addressable tab.
- **General Ledger** remains the accounting truth and owns Tally sync.
- **GST** gains GSTR-1/2B/3B/9, books-vs-portal reconciliation, e-invoice and filing status tabs.
- E-invoice actions live on taxable invoice/sale details; e-way bill actions live on dispatch/GRN/gate-pass details.
- Bill-wise allocations appear inside receipt/payment dialogs.
- Consolidation is a report scope toggle (company vs group), not a separate module.
- Multi-currency is configured once and appears only on transactions that need a non-base currency.

### 18.4 Shared Primitives to Build Once

| Primitive | Used by |
|---|---|
| **Entity activity timeline** | Lead, customer, sale, project, PO, supplier, employee, ticket |
| **Document template engine** | RFQ, PO, allotment, demand notice, agreements, NOC, possession, payslip, tax certificates |
| **Document vault + versioning** | Customer KYC, project drawings, contracts, supplier docs, compliance |
| **Policy-driven approval rail** | PO, requisition, quote award, sale cancellation/transfer, change order, expense, DPR |
| **Party account/balance service** | Customers, suppliers, subcontractors, brokers, tenants |
| **Scheduled obligations engine** | Payment plans, rent, maintenance, filing dates, follow-ups, renewals |
| **Integration event/outbox** | Tally, GST, portals, bank feeds, WhatsApp, email, webhooks |
| **Custom fields + field policy** | Industry/company-specific metadata and field-level security |
| **Print/document preview action** | All business documents without adding navigation routes |

### 18.5 New Destination Pages Allowed

Only distinct high-frequency or external workspaces justify new destinations:

1. **Customer portal** — external buyer/tenant identity and self-service.
2. **Partner portal** — external broker/channel-partner identity and pipeline/commission view.
3. **Supplier portal** — external supplier PO, dispatch, invoice and payment view.
4. **Facilities workspace** — only when operating completed properties is an active business line.
5. **Workflow builder** — already present; enhance rather than duplicate.
6. **Low-code builder** — defer until core operational flows are complete.

Everything else belongs in existing workspaces, entity details, dialogs or background jobs.

### 18.6 Delivery Order

| Phase | Cohesive outcome | Key work |
|---|---|---|
| **1. Commercial lifecycle** | Enquiry to booking in one Sales workspace | Lead pipeline, activity/follow-up, site visit, convert-and-book, customer timeline |
| **2. Buyer lifecycle** | Booking to collection, registration and possession | Automatic payment-plan setup, demand notices, interest policy, documents, KYC, handover |
| **3. External relationships** | Brokers, customers and suppliers can self-serve | Partner portal, customer portal, supplier portal, commissions |
| **4. Construction assurance** | Changes, quality and safety are controlled in context | Change orders, NCR/CAPA, safety incidents, document vault |
| **5. Statutory books** | Tally-level compliance without leaving Books | Bank reconciliation, e-invoice, e-way bill, GSTR-2B/reconciliation, TCS, bill-wise allocation |
| **6. Asset operations** | Completed properties and equipment remain maintainable | Preventive maintenance, facility requests, utilities, lease audits |
| **7. Extensibility** | Companies can adapt without page or code sprawl | Custom fields, field policies, webhooks, workflow templates, report builder |

### 18.7 Acceptance Rule for Every Added Capability

A capability is complete only when:

- it is reachable from the preceding step in its business flow;
- it has one obvious primary action and no dead-end empty state;
- permissions hide actions the user cannot perform;
- the mutation, audit event, notification and GL effect (when financial) are atomic or reliably coordinated;
- the result appears in the relevant entity timeline and report;
- desktop and mobile use the same business vocabulary and shared domain component;
- no new navigation link was added if a contextual placement can serve the task better.

---

## 19. WHY CUSTOMERS PAY

### 19.1 The Economic Jobs

Companies do not pay for a larger menu. They pay to remove expensive uncertainty:

1. **Compliance survival** — accurate GST/TDS/RERA records, evidence, deadlines and auditability.
2. **Margin protection** — control material rates, wastage, rework, contractor billing and project overruns.
3. **Cash conversion** — invoice/demand on time, collect faster, see receivables and commitments before cash becomes critical.
4. **Execution certainty** — know what must happen today, who owns it, and what is blocked.
5. **Truth across site and office** — field evidence becomes stock, cost, progress and accounting truth without re-entry.
6. **Revenue conversion** — prevent lead leakage, double booking and missed follow-up; move buyers from enquiry to possession.
7. **Trust with external parties** — give customers, brokers and suppliers a controlled self-service view instead of WhatsApp ambiguity.

Tally is paid for primarily because finance teams and accountants trust the books and compliance outputs. Zoho is paid for because connected horizontal applications reduce handoffs and can be configured. 4QT is paid for because real-estate-specific workflows already understand units, bookings, construction-linked plans, brokers and possession. Nirman's opportunity is to combine those reasons while keeping site execution substantially simpler.

### 19.2 Capability-to-Value Map

| Capability/module | Primary buyer | Costly problem removed | Outcome worth paying for | Use frequency | Product role |
|---|---|---|---|---|---|
| **Procurement control** | Procurement head, owner | Informal indents, weak quote evidence, rate leakage, delayed approvals | Faster approved buying with defensible vendor selection and commitment visibility | Daily | Core operations module |
| **Stock & stores** | Store keeper, project head, finance | Unknown site stock, theft/leakage, stock-outs, wrong valuation | Trusted on-hand quantity, movement proof, reorder automation and cost valuation | Continuous/daily | Core operations module |
| **Construction control** | Project director, QS, project manager | BOQ and schedule detached from actual work and cost | Early overrun/delay detection; verified quantity and progress | Daily/weekly | Premium vertical module |
| **Subcontractor & RA** | QS, accounts payable | Retention, advance, cumulative quantity and TDS disputes | Faster certification and payment with a complete calculation trail | Monthly/milestone | Construction add-on or bundle |
| **Real-estate CRM** | Sales head | Leads lost in portals, calls and spreadsheets | More follow-ups completed, site visits converted and source ROI visible | Daily | Revenue module |
| **Booking & collections** | Sales/collections head, CFO | Double booking, manual schedules and missed demands | Faster collections, lower overdue balance, reliable buyer account | Daily/monthly | Revenue module |
| **Land & unit inventory** | Developer/owner | Parcel/unit status and cost held in spreadsheets | One sellable-inventory truth with protected cost basis | Weekly/transactional | Real-estate add-on |
| **Books & GST/TDS** | CFO, accountant, CA | Duplicate posting, reconciliation delay and compliance error | Books that tie to operations; filing-ready tax data and audit trail | Daily/monthly | Core finance module |
| **Tally bridge** | Accountant, owner | Operations and Tally diverge; month-end re-entry | Preserve CA/Tally workflow while automating operational vouchers | Daily/monthly | Included connector; premium support possible |
| **People, attendance & payroll** | HR head, project manager | Ghost labour, attendance disputes and manual wage calculation | Verified workforce cost and faster payroll | Daily/monthly | Workforce module |
| **DPR, quality & safety** | Project manager, QA/QC | Late progress, hidden consumption variance, undocumented defects/incidents | Same-day evidence, faster corrective action, lower rework/wastage | Daily | Field assurance module |
| **Equipment & fleet** | Plant manager, project head | Unknown location/utilization, missed service and avoidable breakdowns | Higher utilization and fewer unplanned outages | Daily/weekly | Asset operations add-on |
| **Rentals & lease operations** | Asset manager | Missed rent, deposit disputes, renewals and utility ambiguity | Predictable recurring collection and lease compliance | Monthly | Property operations add-on |
| **Facilities** | Facility/mall manager | Reactive maintenance, unresolved tickets and no space/utility truth | SLA-driven maintenance and recoverable operating cost | Daily | Optional post-handover module |
| **Customer portal** | Sales/service head | Repetitive status calls, document requests and payment confusion | Lower service load and higher buyer trust | Weekly/monthly | External portal add-on |
| **Broker/partner portal** | Sales head | Lead ownership and commission disputes | More channel sales with transparent attribution and payout | Daily/monthly | External portal add-on |
| **Supplier portal** | Procurement/AP | PO, dispatch, invoice and payment status handled manually | Fewer calls, cleaner invoice intake and delivery coordination | Daily | External portal add-on |
| **Workflow automation** | Operations/admin | Every exception requires code or manual chasing | Adaptable approvals, reminders and escalations | Background/admin | Platform add-on |
| **Analytics** | Leadership | Reports assembled after decisions are already late | Exception-first decisions across projects and companies | Daily/weekly | Included standard insights; premium custom BI |

### 19.3 Table Stakes vs Paid Differentiation

**Table stakes** should not be fragmented into costly micro-add-ons:

- authentication, company scoping, RBAC and audit;
- basic party/customer/supplier records;
- standard lists, filters, export and print;
- base notifications and mobile access;
- standard financial statements for companies using Books;
- backups, security updates and data export.

**Premium differentiation** is where configuration and domain depth create measurable value:

- construction-linked collections and buyer lifecycle;
- comparative landed-cost procurement with three-way matching;
- BOQ/WBS/MB/EVM and project cost control;
- RERA/compliance evidence and statutory integrations;
- RA bills, retention, TDS and measurement linkage;
- offline field proof with GPS/camera/signature/scan;
- external portals and white-label experiences;
- configurable workflows, custom fields and integration events;
- multi-company consolidation and advanced analytics.

### 19.4 Packaging Model

Nirman should package by **business capability and operating scale**, not by exposing 50 applications and not by charging every labourer as a full office user.

#### Required Foundation

Every tenant receives Company, Identity, RBAC, Audit, Tasks, Approvals, Notifications, Documents, Module Registry and Data Export. Foundation contains no domain transactions by itself.

#### Independently Activatable Modules

| Module | Can run alone with Foundation? | Important dependencies |
|---|---:|---|
| **Procure** | Yes | Optional Books posting |
| **Stock** | Yes | Material catalogue; Procure optional |
| **Construct** | Yes | Projects; Stock/People/Books enrich actual cost |
| **Sell / CRM** | Yes | Units optional for generic CRM; Books optional for GL |
| **Land & Units** | Yes | Projects; Books optional |
| **People** | Yes | Projects optional for site allocation; Books optional for payroll GL |
| **Books & Tax** | Yes | Receives posting contracts from any enabled module |
| **Rentals** | Yes | Parties/assets; Books optional |
| **Equipment & Fleet** | Yes | Projects/Stock optional; Books optional for depreciation |
| **Manufacturing** | Yes | Stock required; Books recommended |
| **Facilities** | Yes | Assets/Equipment optional; Parties required |
| **Portals** | No | Depends on the internal module whose records it exposes |
| **Automation & Extensions** | No | Operates on enabled modules only |

A company may therefore use Stock without CRM, CRM without construction, People without Books, or Books as the operational ledger while continuing to sync to Tally. Enabling an integration must not force unrelated modules on.

#### Commercial Metering Principles

- Base subscription by company/entity and operating scale.
- Project/site bands for construction-heavy use.
- Named office users for high-control workflows; inexpensive or included field identities for attendance, DPR and proof capture.
- External portal users should not consume full internal licenses.
- Usage-based pass-through for WhatsApp, OCR, e-sign, storage and government/provider transactions.
- Implementation, data migration, workflow configuration and training are explicit professional services.
- Annual plans can discount commitment, but data export and exit must never be held hostage.

Exact pricing must follow customer interviews and unit economics; competitor list prices and private 4QT quotes should not be treated as reliable willingness-to-pay evidence by themselves.

---

## 20. MODULAR PRODUCT ARCHITECTURE

### 20.1 Architectural Choice

Keep Nirman as a **modular monolith**: one deployment and one PostgreSQL database, with explicit domain boundaries. Do not split into microservices. Stock, GL and audit currently benefit from one atomic transaction; distributing those writes would add failure modes without customer value.

Modularity means:

- capabilities can be activated independently per company;
- navigation and permissions are derived from enabled capabilities;
- modules publish stable commands, queries and events;
- modules do not reach into another module's tables for new write flows;
- disabling a module preserves its data and history;
- module upgrades are additive and backward compatible.

### 20.2 Shared Kernel

The kernel is always active and deliberately small:

- tenant/company context;
- authentication and sessions;
- roles, permissions and scope;
- audit append;
- tasks and approval envelopes;
- document metadata/storage contract;
- notification contract;
- domain event/outbox contract;
- module activation/configuration;
- shared identifiers, money/quantity/date primitives.

Projects, customers, suppliers, stock, journals and employees are **not** kernel concepts. They belong to modules. A generic `Party` abstraction may eventually unify external identity, but it should be introduced only through a migration plan—not by immediately rewriting mature customer/supplier tables.

### 20.3 Module Registry

Each module exposes a static manifest. A company-level configuration determines whether that manifest is active.

```ts
interface ModuleManifest {
  id: string;
  version: string;
  label: string;
  dependencies: string[];
  defaultEnabled: boolean;
  capabilities: string[];
  permissions: string[];
  desktopNav: NavContribution[];
  mobileJobs: MobileJobContribution[];
  eventSubscriptions: EventSubscription[];
  glPostingTypes: string[];
  documentTypes: string[];
}
```

The manifest contains declarations, not arbitrary startup code. Activation hooks should seed safe defaults only. They must never delete data on deactivation.

A conceptual `CompanyModule` record stores `companyId`, `moduleId`, `enabled`, `version`, and JSON configuration. The database schema for all shipped modules remains migrated for every tenant; flags govern product behavior, not physical table existence.

### 20.4 Recommended Module Boundaries

| Module | Owns | Publishes |
|---|---|---|
| **Foundation** | Company membership, auth, scopes, audit, tasks, approvals, notifications, module config | user/company context, audit/event/document/approval ports |
| **Catalogue** | Materials, categories, UOM, HSN/SAC, price policies | material snapshots and valuation inputs |
| **Procure** | Requisition, RFQ/quotes, PO, supplier invoice/return/payment | approved order, receipt, supplier liability events |
| **Stock** | Locations, lots/serials, movements, transfer, issue, count, scrap | immutable movement and inventory valuation events |
| **Construct** | Project/phase, BOQ, WBS, MB, change order, project controls | progress, earned value, verified quantity and commitment views |
| **Contractors** | Subcontractor, work order, RA bill, retention/TDS | certified cost and payable events |
| **Sell** | Lead, activity, customer, booking/sale, payment plan, registration/possession | customer receivable, payment and lifecycle events |
| **Land & Units** | Land purchase/parcel/partition, built unit, valuation, listing | sellable asset and capitalization events |
| **Rentals** | Tenancy, recurring obligation, deposit, utility allocation | rent receivable and deposit events |
| **People** | Employee, crew, attendance, leave, payroll, performance | labour cost and workforce events |
| **Field Assurance** | DPR, consumption variance, quality, NCR/CAPA, safety | progress, material consumption and incident events |
| **Equipment & Fleet** | Equipment, assignment, maintenance, vehicle/trip | usage, maintenance cost and availability events |
| **Books & Tax** | Chart, journal, tax returns, reconciliation, consolidation | financial statements and posting acknowledgements |
| **Facilities** | Facility/space, service request, preventive maintenance, utility meter | service cost, SLA and occupancy events |
| **Portals** | External identities, consent, projections/read models | controlled commands into owning modules |
| **Automation** | Workflow definitions/runs, webhooks, custom fields | policy actions against published module capabilities |

The first migration should not physically move every file. Establish the registry and contracts first, then reorganize code only when touching a domain.

### 20.5 Stable Cross-Module Contracts

#### Commands

A command asks the owning module to change its state, for example:

- `stock.recordReceipt`
- `stock.issueToProject`
- `books.postSourceTransaction`
- `sell.recordPayment`
- `notifications.sendTemplate`

Commands return typed results and run inside the caller's transaction when atomicity is required.

#### Queries / Read Models

Cross-module screens consume purpose-built read contracts such as `ProjectCostSummary`, `CustomerBalance`, `SupplierOutstanding`, and `AvailableUnit`. They should not reproduce joins in every page.

#### Domain Events and Outbox

Events describe completed facts (`goods.received`, `material.issued`, `milestone.completed`, `payment.received`). Write the event to an outbox in the same transaction as the source mutation. Handlers for WhatsApp, portal sync, external webhooks and analytics run asynchronously and idempotently. Stock + GL writes that must never diverge can remain synchronous transactional commands.

#### GL Posting Contract

Every financial module publishes a source payload with:

- source type and immutable source ID;
- company/project/cost-centre dimensions;
- transaction date and currency;
- net, tax and gross amounts;
- reversal relationship;
- idempotency key.

Books owns account resolution and balanced journal creation. Domain modules must not invent account codes in UI/API code.

#### Documents, Approvals and Notifications

Modules register document types, approval policies and notification events. Shared engines render and deliver them, while the module supplies variables and policy context. This prevents a separate PDF/approval/WhatsApp implementation in every feature.

### 20.6 Activation Semantics

When a module is disabled:

- its desktop/mobile navigation contributions disappear;
- command/API handlers return a clear module-disabled response;
- schedules and event subscriptions stop;
- its permissions are hidden from role configuration;
- cross-module widgets degrade gracefully;
- existing records remain queryable to authorized owners through export/archive tools;
- audit and journal history remain immutable.

Dependencies are validated before activation. Deactivation is blocked when another enabled module has a hard dependency; soft dependencies simply remove enrichments.

### 20.7 Incremental Code Organization

Avoid a big-bang `packages/kernel` + dozens of package moves. Start within the existing packages:

```text
packages/services/src/modules/
  foundation/
  catalogue/
  procure/
  stock/
  construct/
  sell/
  people/
  books/

apps/web/src/modules/
  <module>/manifest.ts
  <module>/desktop/
  <module>/mobile/
  <module>/shared/
```

Keep `@nirman/services` backward-compatible exports while moving one domain at a time. Extract a separate package only when a boundary is stable and reduces actual coupling. Prisma can remain one schema grouped by ownership; separate databases or schemas are not required.

### 20.8 Versioning and Replaceability

- Each manifest has a semantic module version and config schema version.
- Migrations are additive and deployed with the application, not when a customer toggles a module.
- Events and read contracts are versioned; consumers tolerate additive fields.
- Provider interfaces isolate Tally, WhatsApp, email, portal, bank, OCR and e-sign vendors.
- A provider can be replaced without changing the domain command.
- Data export is module-scoped and uses stable public field names.
- Custom workflows reference capability IDs, not component paths or internal function names.

### 20.9 Architecture Tests

Add automated boundaries as modules emerge:

- module dependency-cycle test;
- manifest dependency and permission validation;
- disabled-module API/nav tests;
- event schema compatibility tests;
- idempotent event-handler tests;
- every financial source type has a balanced posting and reversal test;
- mobile and desktop labels/actions derive from the same capability manifest.

---

## 21. MOBILE-FIRST PRODUCT MAP

### 21.1 Mobile Product Principle

Desktop is where users configure, compare large matrices and investigate history. Mobile is where work is captured, approved, proved and followed up. Mobile navigation should therefore be generated from **the user's daily jobs**, intersected with enabled company modules and permissions—not from a fixed list of every module.

The current V2 shell provides strong primitives, offline queue, camera, GPS, signature and scanning. Its main structural issue is that every role sees the same Home / Inventory / HR / Accounts / Settings tabs while the overflow sheet contains dozens of links. The target is one shell, one capability registry, and a role-specific 4–5-tab journey.

### 21.2 Mobile Tab Composition

`mobileTabs = personaJobs ∩ enabledModules ∩ permissions`

Every role gets:

- **Today** — attention, tasks, reminders and resumable drafts;
- up to three primary job hubs;
- **More/Me** — infrequent destinations, profile, sync queue and settings.

| Persona | Primary mobile tabs | Home/attention priorities |
|---|---|---|
| **Owner / executive** | Today, Projects, Approvals, Books, More | cash, overdue collections, overruns, approvals, compliance failures |
| **Project manager** | Today, Projects, Site, Procure, More | milestone delay, DPR review, indents, material shortage, RA bills |
| **Procurement manager** | Today, Procure, Quotes, Deliveries, More | quote gaps, approval routing, overdue PO, rate variance, supplier risk |
| **Site engineer / supervisor** | Today, DPR, Stock, Tasks, Me | attendance, today's work, issue/receive, offline drafts, incidents |
| **Store keeper** | Today, Receive, Stock, Issue, More | inbound deliveries, pending issues, low stock, counts, gate passes |
| **Sales manager** | Today, Pipeline, Units, Collections, More | follow-ups, site visits, hot leads, available units, overdue installments |
| **Accountant** | Today, Payables, Receipts, Books, More | unmatched invoice, payment due, bank match, tax/Tally failure |
| **HR manager** | Today, Attendance, People, Payroll, More | anomalies, leave approvals, onboarding, payroll readiness |
| **QA/QC engineer** | Today, Inspections, DPR, Issues, More | planned inspections, failed receipt, NCR/CAPA, safety observation |
| **Customer** | Home, Property, Payments, Documents, Help | next demand, project progress, receipts, pending KYC/service ticket |
| **Broker** | Home, Leads, Inventory, Commission, Me | assigned leads, follow-ups, available units, payout status |
| **Supplier** | Home, Orders, Dispatch, Invoices, Payments | accepted PO, delivery slot, invoice exception, payment status |

### 21.3 Journey Hubs Instead of Page Lists

#### Sales Mobile Hub

A salesperson should not navigate separately through Customers, Sales, Units and Portal Listings to handle one buyer. The mobile Sell hub should expose:

1. **Pipeline** — leads ordered by overdue follow-up and score.
2. **Today** — calls, visits and payments due today.
3. **Inventory** — available units with contextual Share / Hold / Book actions.
4. **Collections** — installments due, overdue and recently received.
5. **One lead sheet** — call/WhatsApp, log outcome, schedule visit, select unit, convert and book.

The first implementation slice follows this model: Pipeline is embedded in Sales on desktop and should be added as a journey view beside the existing mobile collection surface.

#### Site Mobile Hub

Attendance → task/DPR → material issue/receive → incident/quality proof should be reachable without opening a sitemap. The current camera/GPS/signature and queue primitives should be reused.

#### Procurement Mobile Hub

Indent → quote collection → comparison → PO approval → delivery → GRN is one progress path. Detail sheets should show the next allowed action rather than a row of every possible action.

#### Books Mobile Hub

Mobile Books prioritizes capture and exceptions: photograph expense, record receipt, approve/pay, resolve sync or reconciliation exception. Full trial-balance analysis and tax configuration stay desktop-first.

### 21.4 Mobile Interaction Placement

| Work size | Mobile treatment |
|---|---|
| One-tap state change | Inline/swipe action with confirmation where risky |
| Short evidence capture | Bottom sheet with camera/GPS/signature |
| 3–8 field task | Full-height sheet with pinned action bar and draft save |
| Long line-item transaction | Focused route with stepper, offline draft and review step |
| Detail investigation | Read-only detail route or sheet with timeline |
| Large comparison/matrix | Mobile summary + winner/action; full matrix available on desktop |
| Configuration/policy | Desktop-first; mobile read-only status and emergency override only |

### 21.5 Offline Service Levels

| Tier | Meaning | Workflows |
|---|---|---|
| **A — Must complete offline** | Create/edit/submit with queued proof and stable client ID | attendance, DPR, GRN, issue, transfer, stock count, gate pass evidence, safety/quality inspection |
| **B — Draft offline, finalize online** | Capture details locally; server validates stock/price/availability before commit | booking, sale, PO, supplier return, expense, RA measurement |
| **C — Read cache only** | Last synchronized view with clear timestamp | unit inventory, project dashboard, supplier/customer balance |
| **D — Online only** | External authority or high-risk financial action | GST filing, e-invoice IRN, bank payment, Tally sync, final consolidation |

Conflict policy must be domain-specific. Server-wins is unsafe for every case: stock and booking conflicts require explicit rejection and guided resolution; notes/photos can merge; master edits use optimistic versions.

### 21.6 Hardware as Workflow Evidence

- **Camera**: GRN condition, quote/receipt OCR, DPR progress, KYC, defect/incident, unit listing.
- **Barcode/QR**: material/lot/serial, equipment, gate pass, document verification.
- **GPS/geofence**: attendance, receipt, issue, inspection and visit evidence where consent/policy permits.
- **Signature**: delivery, handover, measurement/RA acknowledgement and controlled approvals.
- **Voice-to-text**: optional DPR, site note and sales-call outcome—not a separate assistant workflow.
- Hardware failure always has a typed fallback plus an audit reason; it must not dead-end field work.

### 21.7 Shared Mobile/Desktop Domain Components

Keep separate route shells where the interaction genuinely differs, but share:

- domain types and validation schemas;
- command/API clients;
- status and next-action policy;
- entity summary/read models;
- calculations and formatted provenance;
- activity timeline data;
- permission/capability checks;
- form sections that are not layout-specific.

Desktop renders tables and multi-panel details. Mobile renders cards/lists and bottom sheets around the same `LeadSummary`, `PurchaseOrderDetail`, `ProjectHealth`, or `CustomerBalance` data contract. This prevents two implementations from teaching different business rules.

### 21.8 Mobile Refactoring Order

1. Use only the V2 shell; retire legacy shell imports after verifying no routes depend on them.
2. Make `nav.ts` + module manifests the shared vocabulary; mobile contributes persona job ordering, not duplicate labels.
3. Replace the fixed V2 tab array with capability-derived tabs.
4. Add shared mobile list/detail/form shells; refactor only when touching a workflow.
5. Expand offline queue first for DPR and attendance, then booking drafts and quality/safety evidence.
6. Add mobile Sales Pipeline using the shared lead model/API before building more commercial pages.
7. Keep external customer/broker/supplier portals as separate branded shells over shared module contracts.

### 21.9 Mobile Acceptance Criteria

- a user's top daily action is at most one tap from Today;
- no primary persona has more than five bottom tabs;
- every field-critical form survives app/background/network interruption;
- the user can see unsynced state and retry or resolve it;
- destructive/high-value actions show consequence and require deliberate confirmation;
- proof metadata is visible after submission;
- forms meet the 44px minimum target and work in sunlight/gloved-hand conditions;
- mobile uses the same statuses, permissions, calculations and next-action rules as desktop;
- optional/disabled modules contribute no dead links, alerts or empty tabs.

---

*Research compiled from official websites (4qt.com, tallysolutions.com, zoho.com), review platforms (SoftwareSuggest, SaaSworthy, G2, Capterra), and product documentation. Some details (4QT pricing, API docs, detailed schemas) are not publicly available and would require direct vendor contact.*
