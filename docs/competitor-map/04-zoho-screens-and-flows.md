# 04 — Zoho Screens and Flows

> Zoho is a suite of 55+ apps. For Nirman's competitive context, the relevant
> apps are: **CRM** (leads/deals), **Books** (accounting/invoicing), **Inventory**
> (stock/fulfillment), **Projects** (project mgmt), **Expense** (expenses),
> **Payroll** (salary), **People** (HR/attendance), **Desk** (support),
> **Creator** (low-code), **Analytics** (BI). This file maps the core screens
> and flows for each.

## Navigation model (all Zoho apps)

```
Left sidebar → module list
Top right → + New (create) / Quick Create icon
Module list view → click record → detail page
Detail page → tabs/related lists → actions (Edit, Convert, Send, Print, etc.)
Settings (gear icon) → per-module configuration
```

Every Zoho app follows this pattern. The difference is the modules and fields.

---

## ZOHO CRM

### Modules
Home (pipeline dashboard), Leads, Contacts, Accounts, Deals (Potentials), Campaigns, Tasks, Events, Calls, Products, Price Books, Quotes, Sales Orders, Purchase Orders, Vendors, Cases, Solutions, Forecasts, Activities, Custom Modules

### Screen: Home / Pipeline Dashboard
- **Shows:** Deal pipeline by stage (Qualification → Proposal → Negotiation → Close Won/Lost), today's tasks, overdue activities, lead funnel
- **Actions:** Click deal to open; drag deal between stages (if no blueprint); create task/event/call

### FLOW: Lead Creation
- **Entry:** Leads module → + New (top right)
- **Trigger:** Manual / web form / social / email / chat (SalesIQ) / import
- **Steps:**
  1. Click Leads module (left sidebar)
  2. Click + New (top right)
  3. Fill: First Name, Last Name (mandatory, red line), Company, Email, Phone, Lead Source (dropdown), Lead Status (dropdown: New/Contacted/Qualified/Junk), Industry, Annual Revenue, Description
  4. Click blue Save button (top right)
- **Clicks:** ~8-10 field fills + Save = ~10 clicks
- **Result:** Lead record created, appears in list view, assignment rule fires (if configured)
- **Mandatory fields:** marked with red line on left of field

### FLOW: Lead Conversion (Lead → Contact + Account + Deal)
- **Entry:** Lead detail page → Convert button (top right)
- **Trigger:** Lead qualified (status = Qualified)
- **Steps:**
  1. Open lead record
  2. Click "Convert" (top right)
  3. Convert Lead dialog appears:
     - Option: "Create a new Deal for this Contact" (CHECK THIS — otherwise data lost)
     - Deal Name (auto-filled with Account name, editable)
     - Deal Stage (dropdown: Qualification/Proposal/Negotiation/Closing)
     - Closing Date (mandatory)
     - Deal Amount
     - Assign to (owner)
  4. Click "Convert"
- **Clicks:** ~6 clicks
- **Result:**
  - New Account created (with lead's company info)
  - New Contact created (with lead's personal info)
  - New Deal created (linked to Account + Contact)
  - Lead marked "Converted" (archived, not deleted)
  - Email sent to new owners (if configured)
- **Field mapping:** Setup → Modules and Fields → Leads → Convert Mapping. Custom fields must be explicitly mapped or data is lost.
- **B2B:** creates Account + Contact + Deal
- **B2C:** creates Contact only (no Account)
- **Duplicate handling:** if email matches existing record, merge instead of create

### FLOW: Deal Pipeline Management
- **Entry:** Deals module → list view or Kanban view
- **Stages (standard):** Qualification → Proposal/Quote → Negotiation → Sales Order → Payment → Close Won / Lost
- **Custom pipelines:** multiple pipelines per deal type (e.g. ready-made vs made-to-order)
- **Actions per stage:**
  - Drag deal to next stage (if no blueprint)
  - Or open deal → edit Stage field
  - Activities (calls, emails, meetings) logged on deal timeline
- **Blueprint:** if a blueprint is attached, transitions are gated — must complete required fields/actions before moving to next state

### FLOW: Blueprint (process automation)
- **Entry:** Settings → Setup → Automation → Blueprint → Create Blueprint
- **Steps:**
  1. Select module (e.g. Deals) + layout
  2. Entry criteria (e.g. Deal Amount > $50,000)
  3. Drag States onto canvas (Qualification, Negotiation, Discount Approval)
  4. Add Transitions between states (click + buttons)
  5. Per transition: define required fields, validate, assign people, auto-notify
  6. Save + Publish
- **Result:** deals matching criteria enter blueprint; cannot skip states; mandatory fields enforced

### FLOW: Quote → Sales Order → Invoice
- **Entry:** Deal detail → Quotes related list → + Quote
- **Steps:**
  1. Create Quote (select products, qty, rate, discount, tax)
  2. Send quote to customer (email)
  3. Convert Quote → Sales Order
  4. Convert Sales Order → Invoice
  5. Send invoice (email/link)
  6. Record payment against invoice
- **Clicks:** ~20 clicks end to end (quote → payment)
- **Integration with Books:** if CRM-Books integration enabled, transactions sync automatically

### Screen: Campaigns
- **Types:** Email, Social, Webinar, Trade Show, etc.
- **Flow:** Create Campaign → Add leads → Track responses → Measure ROI (lead conversion by campaign)

### Screen: Cases (Support)
- **Flow:** Case → Assignment rule → Resolution → Closure
- **Linked to:** Contact, Account

### Reports (CRM)
Pipeline Analysis, Lead Conversion, Win/Loss, Sales by Territory, Forecast, Activity, Campaign ROI, Case Analysis, Custom

---

## ZOHO BOOKS

### Modules
Dashboard, Sales (Invoices, Estimates, Sales Orders, Credit Notes, Recurring Invoices, Retainer Invoices, Customers), Purchases (Bills, POs, Vendor Credits, Recurring Bills, Vendors), Items (Items, Price Lists, Item Groups), Banking (Accounts, Credit Cards, Feeds, Rules, Transfers), Projects (Projects, Timesheets, Project Invoicing), Expenses (Expenses, Claims), Taxes (Taxes, Exemptions), Reports (50+), Settings

### Screen: Dashboard
- **Panels:** Total Receivables, Total Payables, Cash Flow, Income & Expense, Top Expenses (pie chart), Projects, Bank & Credit Cards, Account Watchlist
- **Click any panel** → drill into transactions

### FLOW: Create Invoice
- **Entry:** Sales → Invoices → + New (top right)
- **Steps:**
  1. Customer Name: select customer (mandatory, red field)
  2. Invoice#: auto-generated (or select series)
  3. Order Number: optional
  4. Invoice Date, Terms, Due Date
  5. Salesperson: select
  6. Select Price List
  7. Item Table: select item → Qty → Rate (auto-filled) → Tax (auto) → Discount (% or amount)
  8. Add more rows as needed
  9. Shipping Charges, Adjustment
  10. Customer Notes, Terms & Conditions
  11. Attach files (receipts, images)
  12. Click "Save" (draft) or "Save and Send" (email to customer)
- **Clicks:** ~15-20 for a 2-line invoice
- **Result:** Invoice created (Draft or Sent status), appears in customer record, A/R updated
- **Invoice types:** Regular, Recurring (weekly/monthly/custom), Retainer (advance)

### FLOW: Send Invoice
- **Entry:** Invoice detail → Mail/SMS dropdown
- **Steps:**
  1. Select Email / SMS / WhatsApp / Share Link
  2. Email: From (org email), To (customer email), Subject, Body (template), attach PDF
  3. Click Send
- **Customer can:** Accept, Decline, or Pay Now (via link)

### FLOW: Record Payment
- **Entry:** Invoice detail → Record Payment
- **Steps:**
  1. Amount Received
  2. Payment Date, Payment Mode (cash/cheque/online), Deposit To account
  3. Reference#, Notes
  4. Attach receipt
  5. "Send Payment Thank You email" toggle
  6. Click Record Payment
- **Result:** Invoice → Paid (or Partially Paid), GL entry, A/R reduced

### FLOW: Credit Note (Sales Return)
- **Entry:** Invoice detail → More → Create Credit Note
- **Result:** Credit note created, linked to invoice, A/R adjusted

### FLOW: Expense Recording
- **Entry:** Expenses module → + New
- **Steps:**
  1. Expense category
  2. Amount, Date, Paid Through (account)
  3. Mark billable (assign to customer/project)
  4. Attach receipt
  5. Save
- **Billable expense** → convert to invoice later

### FLOW: Bill (Vendor Invoice)
- **Entry:** Purchases → Bills → + New
- **Steps:** Select vendor, enter bill no/date/amount, line items, tax, due date → Save
- **Link to PO:** if PO exists, select it → auto-fill

### FLOW: Bank Reconciliation
- **Entry:** Banking → select account → Reconcile
- **Steps:**
  1. Import bank feed (auto from 145+ banks or manual CSV)
  2. Match feed transactions with Books transactions (auto-match by amount/date)
  3. Unmatched → create new transaction or match manually
  4. Reconcile → cleared balance matches bank
- **Rules:** auto-categorize recurring transactions

### Reports (Books — 50+)
**Business Overview:** Inventory Summary, Inventory Valuation, FIFO Cost Lot, ABC Classification
**Receivables:** A/R Aging, Invoice Details, Overdue, Payments Received, Time to Get Paid, Credit Note Details, Refund History
**Payables:** A/P Aging, Bill Details, Vendor Payments, Time to Pay
**Sales:** Sales by Customer/Item/SalesPerson
**Purchases:** Purchase by Vendor/Item
**Inventory:** Stock Summary, Valuation, Slow Moving, Stock Aging
**Tax:** Tax Summary, GST, 1099
**Project:** Project Profitability, Timesheet, Expense, Reimbursement
**Accountant:** Trial Balance, P&L, Balance Sheet, Cash Flow, Funds Flow, General Ledger, Journal Report

---

## ZOHO INVENTORY

### Modules
Dashboard, Items (Items, Item Groups, Composite Items, Price Lists), Sales (Sales Orders, Invoices, Packages, Shipments, Returns), Purchases (POs, Packages Received, Returns), Inventory (Stock Adjustments, Stock Transfer, Physical Inventory, Picklists), Warehousing (Warehouses, Bins), Reports, Settings

### FLOW: Sales Order → Pick → Pack → Ship → Invoice
- **Entry:** Sales → Sales Orders → + New
- **Steps:**
  1. Create Sales Order (customer, items, qty, rate, tax)
  2. Confirm Sales Order
  3. **Picklist generation:**
     - Inventory → Picklist → + New
     - Select grouping (By Item / By Sales Order / No Grouping)
     - Add items (filter by customer/items/SO)
     - Enter qty to pick, select serial/batch if tracked, select bin
     - Generate Picklist → assign to picker
     - Picker marks items picked
  4. **Package creation:**
     - Open SO → Create → Package
     - Select items, qty, package slip number
     - Save
  5. **Shipment creation:**
     - Open SO → Create → Shipment
     - Choose: Ship Manually OR Ship via Carrier (FedEx/UPS/DHL/USPS)
     - Ship Manually: enter Shipment Order#, Carrier, tracking, delivery status
     - Ship via Carrier: validate address → add package → calculate rates → create shipment → print label
  6. **Invoice creation:**
     - Open SO → Create → Invoice (or auto from Books integration)
     - Invoice linked to SO + shipment
  7. **Payment:** record against invoice (in Books)
- **Clicks:** ~30-40 end to end (SO → payment)
- **Result:** Stock reduced, invoice created, GL entry (via Books sync), tracking sent to customer

### FLOW: Purchase Order → Receive → Stock In
- **Entry:** Purchases → POs → + New
- **Steps:**
  1. Create PO (vendor, items, qty, rate)
  2. Approve PO
  3. Receive goods: PO → Create → Purchase Receive
  4. Enter received qty, serial/batch, godown
  5. Stock increased
  6. Vendor bill: PO → Create → Bill (syncs to Books)
- **Result:** Stock in, vendor liability created (in Books)

### FLOW: Stock Transfer (Warehouse A → B)
- **Entry:** Inventory → Stock Transfer → + New
- **Steps:** Select item, qty, source warehouse, destination → Save
- **Result:** Stock reduced at source, increased at destination

### FLOW: Stock Adjustment
- **Entry:** Inventory → Stock Adjustments → + New
- **Steps:** Select item, qty change (+/-), reason → Save
- **Result:** Stock adjusted, GL entry (via Books) for write-off/damage

### FLOW: Composite Item Assembly
- **Entry:** Items → Composite Items → + New
- **Steps:** Define composite (finished good) + components (with qty) → assemble → component stock reduced, composite stock increased

### Reports (Inventory)
Inventory Summary, Valuation, Stock Summary, SO/PO Summary, FIFO Cost Lot, ABC Classification, Slow Moving, Stock Aging

### Integrations
Zoho Books (accounting sync), CRM (sales order), Commerce (e-commerce), Projects (material tracking), FedEx/UPS/DHL/USPS, Amazon/eBay/Etsy/Shopify, Stripe/PayPal

---

## ZOHO PROJECTS

### Modules
Overview, Tasks (with subtasks), Milestones, Task Lists, Issues, Forums, Documents, Pages, Timesheets, Gantt Chart, Calendar, Reports, Custom Modules

### FLOW: Project Setup
- **Steps:** Create Project → Create Task Lists → Create Tasks (assign, dates, dependencies) → Set Milestones → Gantt view
- **Task dependencies:** predecessor/successor (FS/FF/SS/SF)

### FLOW: Task Execution
- **Steps:** Assign task → Update % complete → Log timesheet → Mark complete → Notify

### FLOW: Issue Resolution
- **Steps:** Log issue → Assign → Fix → Verify → Close

### Reports
Gantt, Milestone Gantt, Task Summary, Resource Usage, Timesheet Summary, Issue Summary, Project Status, Custom

---

## ZOHO EXPENSE

### Modules
Dashboard, Expenses, Reports, Advances, Trips, Per Diem, Purchase Orders, Policies, Approvals, Settings

### FLOW: Expense Submission
- **Steps:** Create expense → attach receipt (OCR auto-extract) → submit to report → approve → reimburse
- **OCR:** scan receipt → auto-extract amount, date, merchant, category

### FLOW: Advance
- **Steps:** Request → Approve → Receive → Adjust against expenses

---

## ZOHO PAYROLL

### Modules
Dashboard, Employees, Salary Components, Pay Runs, Salary Revisions, Loans, Timesheets, Leave, Attendance, Forms, Reports, Settings

### FLOW: Pay Run
- **Steps:** Add Employees → Set Salary Components → Run Pay Run → Review → Payslips → Disburse
- **Statutory:** PF, ESI, PT, TDS

---

## ZOHO PEOPLE

### Modules
Employee, Leave, Attendance, Timesheet, Shift, Recruitment, Onboarding, Exit, Performance, Custom Forms

### FLOW: Attendance
- **Entry:** Mobile app → Check In (GPS-tagged) / Web → Mark attendance
- **Modes:** GPS, biometric, web check-in, manual

### FLOW: Leave
- **Steps:** Apply → Approve → Balance update

---

## ZOHO DESK (Support)

### Modules
Tickets, Contacts, Accounts, Knowledge Base, Reports, SLA, Automation

### FLOW: Ticket
- **Steps:** Ticket created (email/web/chat/phone) → Assignment rule → Agent works → Resolve → Close → CSAT survey
- **SLA:** response time + resolution time per priority/department

---

## ZOHO CREATOR (Low-Code)

### Modules
Application Builder, Forms, Pages, Reports, Workflows, Deluge Scripting, APIs, Integration, Mobile App Builder

### FLOW: Build Custom App
- **Steps:** Create Form → Add Fields → Layout → Workflow → Deluge script → Deploy → Mobile app auto-generated
- **Use case:** custom construction modules (BOQ, DPR, RA bill) that Books/Inventory/Projects don't cover natively

---

## ZOHO ONE (bundle)

- **Included:** 50+ apps across Sales, Marketing, Support, Comms, Collab, Finance, HR, BI, Low-Code, Operations
- **Pricing:** Essentials ~$15/user/mo (15+ apps); Standard All-Employee $37/user/mo (50+ apps); Standard Flexible $90/user/mo (50+ apps, specific users)
- **Connection:** Unified Admin Console (SSO via Zoho Directory), cross-app native integration, unified data (shared customer/vendor/item), unified reporting, Zoho Flow (cross-app workflows)

---

## Integration architecture

- **Zoho Flow:** 1000+ connectors, visual workflow builder, triggers (event/schedule/webhook), actions (CRUD + notify), webhooks (in/out), hybrid (on-prem agent), logic elements (conditions/loops/delays/variables)
- **REST APIs:** every app, OAuth 2.0, SDKs (Java/Python/Node/PHP/.NET/Ruby), webhooks, rate limits by plan
- **Deluge:** in-app scripting, cross-app API calls, external API calls, data manipulation
- **Data Sync:** native sync between Zoho apps, custom field mapping, near real-time, bulk import/export

---

## Roles & permissions

- **RBAC:** Roles (what you can do), Profiles (what you can see), Groups (organization)
- **Standard roles:** Super Admin, Admin, Standard User, Viewer
- **Permission levels:** Module (View/Create/Edit/Delete/Import/Export), Field (View/Edit), Record (View/Edit/Delete), API (scopes)
- **Data access:** Hierarchy-based, Territory-based, Shared records, Private records

---

## Mobile

- Zoho One unified app (all apps, admin console, push notifications, offline mode, biometric login)
- Individual native iOS/Android apps per product
- Progressive Web Apps
