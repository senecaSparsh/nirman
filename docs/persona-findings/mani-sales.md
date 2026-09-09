# Mani Singh — Sales Manager Journey Audit

**Persona:** Mani Singh, SALES_MANAGER, SRG REALCON  
**Phone:** 7302920203  
**Reports to:** Manish (FINANCE_HEAD)  
**Permissions:** SALES_VIEW, SALES_MANAGE, SALE_CREATE, CALL_VIEW, CALL_VIEW_ALL, CALL_CREATE, CALL_RECORDING_LISTEN, TELEPHONY_VIEW, QUOTATION_VIEW

---

## Journey Narrative

I logged into Nirman Inventory OS as Mani Singh, the Sales Manager at SRG REALCON. My job covers the entire sales lifecycle: capturing leads from tele-calling, managing the pipeline, preparing quotations, creating sale orders, tracking the booking → ATS → BBA → registry lifecycle, managing broker relationships, monitoring portal listings, and reviewing call logs. Here's what I found as I traced through each part of the platform.

---

## Step 1: CRM / Leads Dashboard

### What I See

**Desktop (`/crm` → redirects to `/sales?tab=pipeline`)**

- `apps/web/src/app/crm/page.tsx` (line 9): `/crm` redirects to `/sales?tab=pipeline`. The CRM module is embedded inside Sales, not a standalone page.
- `apps/web/src/app/leads/page.tsx` (line 6): `/leads` also redirects to `/sales?tab=pipeline`.
- `apps/web/src/app/sales/page.tsx` (lines 350-364): The Sales page header shows 7 stat cards: Total Units, Available, Sold, Reserved, Open Leads, Booked (revenue), Collected.
- `apps/web/src/components/sales/sales-view.tsx` (lines 72-82): A `WorkflowStrip` shows the lifecycle stages: Lead → Customer → Sale → Collection → Registry. Clicking Lead/Customer/Sale switches tabs.
- `apps/web/src/components/sales/lead-pipeline-view.tsx` (lines 15-23): The Pipeline tab shows stage tabs (All, New, Contacted, Site visit, Negotiation, Booked, Lost) with counts.
- `apps/web/src/components/sales/lead-pipeline-view.tsx` (lines 52-119): A DataTable with columns: Lead (name+phone+email), Stage, Score, Interest (unit+project), Budget, Owner, Next follow-up, Source.
- Overdue follow-ups are highlighted in red (line 109), HOT priority leads get a warning tone (line 165).
- "New Lead" button and "Find duplicates" button are shown if `canManage` is true.

**Mobile (`/m/crm`)**

- `apps/web/src/app/m/crm/page.tsx` (lines 35-55): Shows 4 stat cards: Open Leads, Calls Today, Customers, Active Sales. Also shows Outstanding Receivables.
- Quick action links: Customers & Leads, Add New Lead, Call Log, Sales Pipeline.

### What Works

- **Lead creation** (`apps/web/src/components/sales/lead-form-dialog.tsx`): Full form with name, phone, email, source (6 options: PORTAL, WALK_IN, REFERRAL, BROKER, DIGITAL_AD, OTHER), priority (LOW/MEDIUM/HIGH/HOT), project, interested unit, unit type preference, budget range, owner assignment, next follow-up date, notes. Posts to `POST /api/leads` which calls `createLead()` service.
- **Lead detail** (`apps/web/src/components/sales/lead-detail-dialog.tsx`): Shows lead score, budget, activity count, interest, next action, notes, lost reason. Can log activities (CALL, WHATSAPP, EMAIL, MEETING, SITE_VISIT, NOTE) with outcome and next follow-up. Can move stages (NEW→CONTACTED→SITE_VISIT→NEGOTIATION→LOST). Can convert lead to customer and book.
- **Lead dedup** (`apps/web/src/components/sales/lead-dedup-dialog.tsx`): Finds duplicates by name+phone, lets user pick which to keep, merges (re-parents activities, soft-deletes others). Calls `GET /api/leads/dedup` and `POST /api/leads/dedup`.
- **Lead scoring**: Score is displayed with color coding (≥70 green, ≥45 yellow, else muted).
- **Stage progression**: `NEXT_STAGES` map (line 15-22) enforces a logical flow. LOST leads can be reactivated to CONTACTED.

### What's Broken or Missing

1. **No Kanban board view for leads** — The pipeline is a flat table with stage tabs. Competitors (4QT, Salesforce) show a drag-and-drop Kanban board for visual pipeline management. The BBA Pipeline Board (`bba-pipeline-board.tsx`) exists for sales but there's no equivalent for leads.
2. **No lead source analytics** — No chart or breakdown showing lead conversion rates by source (PORTAL vs WALK_IN vs BROKER vs DIGITAL_AD). This is critical for a sales manager to know which channels are performing.
3. **No bulk lead actions** — Can't bulk-assign leads, bulk-change stages, or bulk-delete. Each lead must be opened individually.
4. **No lead import/export** — Can't import leads from a CSV (e.g., from a portal export) or export the pipeline.
5. **No automated lead scoring explanation** — The score is shown but there's no breakdown of how it was calculated (the `Figure` component says "Source, priority, budget completeness, project/unit interest and recorded engagement" but doesn't show the actual calculation).
6. **No follow-up reminders/notifications** — Overdue follow-ups are highlighted in red but there's no push notification, email reminder, or daily digest for salespeople.
7. **No lead-to-call linkage** — When logging a call manually (`calls-view.tsx` ManualCallForm), there's no field to link the call to a specific lead. The call log and lead pipeline are disconnected.

### What's Confusing

- The `/crm` and `/leads` URLs both redirect to `/sales?tab=pipeline`. A sales manager looking for "CRM" in the navigation might be confused that it's buried inside Sales.
- The `WorkflowStrip` shows "Collection" and "Registry" as steps but they're not clickable tabs — they don't do anything when clicked (line 77-78: no `tab` property).

### India-Specific Gaps

- **No RERA lead source tracking** — RERA mandates that real estate agents register. There's no field to track whether a lead came from a RERA-registered broker vs an unregistered one.
- **No DND (Do Not Disturb) compliance** — India's TRAI DND regulations require checking phone numbers against the DND registry before calling. There's no DND flag or check on leads/customers.

---

## Step 2: Create a New Lead from Tele-Calling Inquiry

### What I See

**Desktop:** Click "New Lead" in the pipeline tab → `LeadFormDialog` opens (`lead-form-dialog.tsx`).

- Form fields: Name*, Phone*, Email, Source*, Priority, Project, Interested Unit, Unit Type, Budget From, Budget To, Owner, Next Follow-up (datetime-local), Notes.
- Source options: Property portal, Walk-in, Referral, Broker, Digital ad, Other.

**Mobile (`/m/leads/new`):**

- `apps/web/src/app/m/leads/new/page.tsx` + `MobileNewLeadClient.tsx` — mobile-optimized lead creation form.

### What Works

- Form submits to `POST /api/leads` (`apps/web/src/app/api/leads/route.ts` line 77).
- Zod validation (line 9-26): name (2-120 chars), phone (7-20 chars), email (valid or empty), source enum, priority enum, budget validation (max ≥ min).
- `createLead()` service is called with all fields including `userId` for audit.
- Success toast: "Lead added to the pipeline".
- Form resets after submission.
- `revalidatePath("/sales")` ensures the pipeline updates.

### What's Broken or Missing

1. **No phone number validation for India** — Phone field accepts 7-20 chars but doesn't validate Indian format (10 digits, +91 prefix). No auto-formatting.
2. **No duplicate check on submit** — The dedup dialog exists but there's no real-time check when creating a lead. If a tele-caller enters a phone that already exists, it silently creates a duplicate.
3. **No "TELECALLING" source option** — The source enum doesn't include "TELECALLING" or "COLD_CALL". A tele-calling inquiry would have to be categorized as "OTHER".
4. **No campaign tracking** — Can't track which marketing campaign or tele-calling batch a lead came from.

### What's Confusing

- The "Interested Unit" dropdown shows all available units across all projects. If no project is selected first, the list can be very long. The filtering by project works (line 63-66) but only if the user remembers to select the project first.

---

## Step 3: Prepare a Quotation for a Prospect

### What I See

**Desktop (`/quotes` → redirects to `/procurement?tab=quotations`):**

- `apps/web/src/app/quotes/page.tsx` (line 6): Redirects to procurement quotations. This is **procurement** quotations (material RFQs), NOT sales quotations for prospects.
- `apps/web/src/app/api/quotations/route.ts`: The quotations API is entirely for procurement — `createQuotationRequest` is about requesting material quotes from suppliers.

**Mobile (`/m/quotations` → redirects to `/m/procurement?tab=quotations`):**

- Same redirect to procurement.

### What Works

- The procurement quotation system works for its purpose (material RFQs, supplier quotes, approval workflow).

### What's Broken or Missing

1. **❌ NO SALES QUOTATION SYSTEM EXISTS** — This is a major gap. There is no way to prepare a sales quotation for a prospect showing:
   - Unit price (per sq.ft. × area)
   - CLP payment plan with milestones
   - Terms & conditions
   - GST breakdown
   - Validity period
   - The quotation is only created as part of the Sale Order (`SellAssetDialog` includes payment plan, expenses, terms), but there's no standalone quotation that can be sent to a prospect before they commit.
2. **No quotation PDF/print template for prospects** — The `print/sale-invoice` page is an allotment letter/invoice for an existing sale, not a pre-sale quotation.
3. **No quotation versioning** — Can't create multiple versions of a quotation for the same prospect with different pricing/options.
4. **No quotation-to-sale conversion** — Can't convert an accepted quotation into a sale order with one click.
5. **No quotation approval workflow** — No manager approval for discounts or special terms.

### India-Specific Gaps

- **No GST breakdown on quotation** — Can't show 1% GST (affordable housing) vs 5% GST (regular) vs 18% (commercial) on a prospect quotation.
- **No CLP milestone demand letter preview** — Can't show the prospect what their payment schedule will look like with construction-linked milestones.
- **No RERA registration number on quotation** — RERA requires the registration number on all marketing materials.

---

## Step 4: Create a Sale Order (Sale Lifecycle)

### What I See

**Desktop (`/sales` → Bookings tab → "New Sale" button):**

- `apps/web/src/components/sales/sales-view.tsx` (lines 327-347): SalesTab with Board/Table view toggle, filters (status, stage, payment, BBA, date range), export buttons (CSV, Excel), "Send Reminders" button.
- `apps/web/src/components/sales/sell-asset-dialog.tsx`: The New Sale dialog is a comprehensive 8-section accordion form:
  1. **Party** — Customer selection (with inline create), required
  2. **Asset** — Land/Unit/Project type selector, asset dropdown, RERA warning if project has no RERA number
  3. **Deal** — Sale price, cost basis (auto), GST rate + amount (auto), estimated profit, advance amount + mode, ATS document upload, deal maturity months, payment cycle
  4. **Payment Plan** — TLP/DPP/CLP selector, auto-generate button, installment rows (description, %, amount, due date/milestone)
  5. **Expenses** — Registry, stamp duty, transfer, lease rent, GST, other — with borne-by (client/seller/NA) and included flag
  6. **Terms & Conditions** — Custom terms with extra amounts and included flags
  7. **Deal Source** — Self/Broker toggle, broker selection, commission amount, "part of deal" checkbox
  8. **Compliance** — ATS/Registry toggle, ATS registration no + date, expected registry date, allow-registry-before-full-payment checkbox, home loan details

**Board view** (`apps/web/src/components/sales/bba-pipeline-board.tsx`): Kanban board with 5 columns: Booked → BBA Signed → Payments → Registry Pending → Completed. Each card shows sale number, asset, customer, price, paid progress, next due installment, BBA status, broker badge, and a next-action hint.

### What Works

- **Sale creation** (`POST /api/sales` → `sellAsset()` service): Full lifecycle support:
  - Asset validation (must be AVAILABLE/HOLD, not already sold)
  - Double-sell guard (checks `saleId` on asset)
  - Asset locking (sets `saleId` on asset to prevent concurrent sales)
  - GST calculation (salePrice × gstRate / 100)
  - TDS auto-computation under Section 194-IA (1% if sale ≥ ₹50L) — `computePropertyTds()` in `sale.ts` lines 52-66
  - Profit calculation (salePrice - costBasis)
  - Payment schedule creation (CLP with WBS milestone linkage, TLP with monthly installments, DPP)
  - Sale expenses with GL posting for seller-borne expenses
  - Sale terms & conditions
  - Broker commission accrual (GL posting via `postBrokerCommission`)
  - Cheque details capture (cheque no, date, bank, photo URL)
  - ATS document upload at booking time
  - Audit logging (`userId`)
  - GL postings for revenue/COGS on immediate full payment
  - `revalidatePath` for all relevant pages

- **Payment Plan Editor** (`payment-plan-editor.tsx`):
  - Three schedule types: TLP (Time-Linked), DPP (Down Payment), CLP (Construction-Linked)
  - CLP fetches WBS milestone nodes from `/api/wbs/nodes?projectId=X` and links installments to construction milestones
  - Auto-generate button: distributes balance evenly across milestones (CLP) or months (TLP/DPP)
  - Percentage validation (must sum to 100%)
  - Amount auto-calculation from percentage
  - Rounding fix on last item

- **Sale lifecycle stages**: PENDING → DEPOSIT_RECEIVED → COMPLETED (or CANCELLED)
  - `sale-detail-dialog.tsx` (lines 224-238): Action buttons appear contextually:
    - PENDING: "Record Deposit"
    - DEPOSIT_RECEIVED: "Complete Sale"
    - Any with balance: "Record Payment"
    - Not COMPLETED: "Cancel Sale", "Edit"
  - Print buttons: Print Form, Print Invoice, Print Draft/LOI, Allotment Letter
  - IRN generation (e-Invoice) button

- **Sale detail dialog** (`sale-detail-dialog.tsx`):
  - Status badges (sale status, sale stage, payment status, BBA/ATS signed)
  - Sale summary grid (price, GST, cost basis, profit, balance due)
  - Deposit info banner
  - Completion info banner with sale deed/ATS numbers
  - ATS/expected registry info banner
  - Compliance documents section (allotment letter, BBA, TDS, home loan, IRN)
  - Document uploads: ATS, BBA, Registry (each with PhotoUploader)
  - Additional attachments (generic polymorphic document store)
  - Deal terms (maturity, cycle)
  - Broker details with "Pay Commission" button
  - Sale expenses table
  - Terms & conditions list
  - Payment schedule with:
    - Horizontal progress visualization (CLP timeline)
    - Legend (Paid/Due/Partial/Pending)
    - Next-due installment banner (overdue highlighting)
    - Installment table with "Collect" buttons and "Demand Notice" print links
  - Payment history (via detail fetch)

- **Complete Sale dialog** (`complete-sale-dialog.tsx`):
  - Final payment amount (defaults to remaining balance)
  - Payment mode + reference
  - Cheque fields if cheque mode
  - ATS/Registry number capture
  - Registry document upload (required)
  - Compliance documents (allotment letter, BBA, TDS, home loan)
  - Calls `completeSale()` service which: reverses deposit liability, posts revenue + COGS, marks asset SOLD, delists portal listings

- **BBA Pipeline Board** (`bba-pipeline-board.tsx`):
  - Derives BBA stage from sale data (`deriveBbaStage` function, lines 25-34)
  - Summary stats: Total Sales, BBA Done, BBA Pending, Overdue, Revenue, Collected, Outstanding
  - Project filter + search
  - Kanban columns with cards showing all relevant info
  - Next-action hints on each card

### What's Broken or Missing

1. **No "Sale Order" concept distinct from "Booking"** — The task asks to "Create a Sale Order (start the sale lifecycle: booking → ATS → BBA → registry)" but the system only has one `AssetSale` record. There's no separate "Sale Order" document that can be created, reviewed, approved, and then converted to a booking. The sale is created directly as a booking.
2. **No sale order approval workflow** — A sales manager can't submit a sale for finance approval before it's finalized. The sale is created immediately with no approval step.
3. **No sale revision/amendment** — Once a sale is created, the `EditSaleDialog` allows some edits but there's no formal revision history or amendment tracking.
4. **CLP due dates not set for milestone-linked installments** — In `payment-plan-editor.tsx` line 139: CLP installments have `dueDate: ""` (empty). The due date should be triggered by WBS milestone completion, but there's no mechanism to auto-set due dates when milestones are completed.
5. **No demand letter generation automation** — The `print/demand-notice/[id]` page exists but there's no automated trigger to generate and send demand letters when a CLP milestone is completed or a TLP due date arrives. The "Send Reminders" button (`sales-view.tsx` line 430) sends reminders but doesn't generate formal demand letters.
6. **Payment schedule GST not per-installment** — `sale.ts` line 466: `scheduleGst = new Decimal(0)` — GST is tracked at sale level, not per installment. For CLP, each demand letter should show the GST component for that installment.
7. **No sale cancellation reason capture** — When cancelling a sale (`sale-detail-dialog.tsx` line 123-149), there's no field to capture why the sale was cancelled (buyer backed out, financing fell through, etc.).
8. **BBA pipeline board not accessible from main navigation** — The `BbaPipelineBoard` component exists but it's not clear if it's rendered anywhere. The SalesTab has a "board" view toggle but it uses `BbaPipelineBoard` only when `view === "board"` — need to verify this is wired correctly.

### What's Confusing

- The "Advance Amount" field in the Deal section is labeled "Advance Amount" but the placeholder says "0". It's not clear if this is the booking token amount or the full down payment. In Indian real estate, the "advance" (bayana) is typically 10% of sale price per RERA, but there's no validation or guidance on this.
- The "Deal Maturity (months)" field is confusing — it's not clear if this means the payment plan duration or the possession timeline.
- The ATS/Registry toggle in the Compliance section says "Either Agreement to Sell (ATS) or Registry — one of the two is the registered document" but this is misleading. In practice, ATS is done first, then registry happens later. They're sequential, not either/or.

### India-Specific Gaps

1. **❌ RERA 10% advance cap not enforced** — RERA Act 2016 Section 13(1) caps the advance at 10% of sale price. The "Advance Amount" field has no validation against this cap. A salesperson could accidentally collect 20% advance, violating RERA.
2. **❌ BBA registration not tracked properly** — BBA (Builder-Buyer Agreement) must be registered under RERA. The system captures BBA number and date but doesn't track whether it's been registered with the RERA authority or just signed.
3. **✅ GST on sale (1%/5%)** — GST rate field is present and GST amount is auto-calculated. However, there's no validation that the rate is correct for the property type (1% for affordable housing, 5% for regular residential, 18% for commercial).
4. **✅ TDS 194IA (buyer deducts 1% if >50L)** — `computePropertyTds()` in `sale.ts` auto-computes 1% TDS for sales ≥ ₹50L. TDS certificate number can be captured at completion. This is well-implemented.
5. **⚠️ CLP milestone demand letters** — The demand notice print page exists but there's no automated workflow to generate demand letters when WBS milestones are completed. The linkage between WBS milestone completion → payment schedule item status change → demand letter generation is missing.
6. **✅ Cheque photo upload** — `ChequeFields` component captures cheque no, date, bank, and photo URL. Cheque clearing/bouncing is tracked with `chequeStatus` and `chequeClearDate`.
7. **✅ Broker commission tracking** — Commission amount, "part of deal" flag, paid status, and paid date are all tracked. `postBrokerCommission` accrues the commission in GL. "Pay Commission" button in sale detail marks it as paid.
8. **No stamp duty calculator** — Stamp duty varies by state (4-9% in different Indian states). The expense head "STAMP_DUTY" exists but there's no auto-calculation based on sale price and state.
9. **No registry fee calculator** — Registry fees are typically 1% of sale price in India. No auto-calculation.
10. **No possession date tracking** — RERA requires a possession date in the BBA. The system tracks `expectedRegistryDate` but not a separate possession date.

---

## Step 5: Review Sale Lifecycle Timeline and Document Uploads

### What I See

**Sale Detail Dialog** (`sale-detail-dialog.tsx`):

- **Status badges** (line 254-265): Sale status, sale stage, payment status, BBA/ATS signed badge.
- **Document uploads** (lines 454-523): Three upload slots:
  - Agreement to Sell (ATS) — with PhotoUploader
  - Builder-Buyer Agreement (BBA) — with PhotoUploader
  - Registry Document — with PhotoUploader, shows "Required for completion" if not uploaded
- **Additional attachments** (lines 526-538): Generic `AttachmentList` component showing ATS, BBA, Registry, Allotment, Draft documents.
- **Payment schedule timeline** (lines 665-696): Horizontal progress bar showing each installment as a colored segment (green=paid, yellow=due, blue=partial, gray=pending). Tooltip on hover shows description, percentage, and status.
- **Next-due banner** (lines 707-733): Shows the next due installment with amount, due date, and days late if overdue. "Collect" button for quick payment.
- **Installment table** (lines 734-775): Full table with installment no, description, %, amount, due date, status, and action buttons (Collect, Demand Notice print link).

### What Works

- **Document upload API** (`POST /api/sales/[id]/document`): `sale-detail-dialog.tsx` line 55-80 — uploads ATS/BBA/REGISTRY/ALLOTMENT documents with URL and filename. Calls the document endpoint which updates the sale record.
- **Document display**: Uploaded documents show as clickable links that open in a new tab.
- **Payment schedule visualization**: The horizontal progress bar gives a quick visual overview of payment status.
- **Demand notice printing**: Each installment has a print link to `/print/demand-notice/[item.id]` which generates a formal demand letter.
- **Print pages**: Multiple print templates exist:
  - `/sales/[id]/print` — Sale Booking Form
  - `/print/sale-invoice/[id]` — Sale Invoice / Allotment Letter (with pricing breakdown, GST, payment history, amount in words, T&C, signatures)
  - `/print/sale-draft/[id]` — Draft / LOI
  - `/print/allotment-letter/[id]` — Allotment Letter
  - `/print/demand-notice/[id]` — Demand Notice for specific installment
  - `/print/payment-receipt/[id]` — Payment Receipt

### What's Broken or Missing

1. **No formal lifecycle timeline view** — There's no visual timeline showing the chronological progression: Booking date → ATS date → BBA date → Deposit date → Each payment date → Registry date → Completion date. The information is scattered across different sections of the dialog.
2. **No document versioning** — When a document is re-uploaded, the old version is lost. There's no history of document versions.
3. **No document expiry tracking** — Some documents (like ATS) have validity periods. No tracking of when a document expires.
4. **No document verification status** — No way to mark a document as "verified" vs "pending verification". The finance team needs to verify documents before revenue recognition.
5. **No e-sign integration** — Documents are uploaded as photos/PDFs but there's no integration with e-sign platforms (like eMudhra, Digio) for digital signing.
6. **Payment schedule item status not auto-updated** — When a payment is recorded, the schedule item status should auto-update to PAID/PARTIAL. Need to verify this is wired in the `recordPayment` service.

### What's Confusing

- The "BBA/ATS Signed" badge (line 259) appears when either BBA or ATS document is uploaded, but it doesn't distinguish which one. A sale could have ATS uploaded but no BBA, and the badge would still say "BBA/ATS Signed".
- The horizontal progress bar segments are proportional but don't show the installment number or amount unless you hover. On mobile, hover doesn't work.

---

## Step 6: Manage Broker Relationships and Track Commissions

### What I See

**Desktop (`/brokers`):**

- `apps/web/src/app/brokers/page.tsx`: Page header with 3 stats: Brokers count, Deals count, Total Commission (with unpaid amount).
- `apps/web/src/components/brokers/brokers-view.tsx`: DataTable with columns: Broker (name+agency), Phone, Default Commission %, Deals, Total Commission, Paid (with unpaid breakdown).
- Search bar, "Add Broker" button.
- Edit and delete actions per broker.
- Broker form dialog: Name*, Phone, Agency, Default Commission %, Notes.

**In Sale Detail** (`sale-detail-dialog.tsx` lines 556-597):

- Broker details section shows: Name, Phone, Agency, Commission amount, "Part of deal" flag, Paid/Pending status.
- "Pay Commission" button (if commission not yet paid and user can manage).

**In Sell Asset Dialog** (`sell-asset-dialog.tsx` lines 715-787):

- Deal Source section: Self/Broker toggle.
- If Broker: broker dropdown (fetched from `/api/brokers`), free-text name/phone fallback, commission amount (auto-filled from broker's default %), "Part of deal" checkbox.

### What Works

- **Broker CRUD**: Create, edit, delete (soft-delete) brokers via `/api/brokers` and `/api/brokers/[id]`.
- **Commission auto-fill**: When selecting a broker in the sale dialog, commission amount is auto-calculated from `defaultCommissionPercent` × sale price (line 286-288).
- **Commission tracking**: `commissionAmount`, `commissionIsPartOfDeal`, `commissionPaid`, `commissionPaidDate` fields on AssetSale.
- **Commission GL posting**: `postBrokerCommission()` accrues commission as a liability when the sale is created (sale.ts line 447-457).
- **Commission payment**: `POST /api/sales/[id]/pay-commission` marks commission as paid and posts GL entry via `postBrokerCommissionPaid()`.
- **Broker-level aggregation**: Brokers page shows total commission and paid amount per broker, aggregated from all their deals.

### What's Broken or Missing

1. **No broker performance analytics** — No conversion rate, average deal size, or revenue generated per broker. Just deal count and commission totals.
2. **No broker commission tier management** — Can't set different commission rates for different project types or unit types. Only one `defaultCommissionPercent` per broker.
3. **No commission slabs** — Indian real estate often has slab-based commissions (e.g., 2% up to ₹1Cr, 1.5% above ₹1Cr). Only flat percentage is supported.
4. **No broker payment history** — The "Pay Commission" button marks it as paid but there's no record of partial payments or a payment schedule for commissions.
5. **No GST/TDS on broker commission** — Broker commissions are subject to GST (if broker is registered) and TDS under Section 194H (5% or 10% depending on broker type). No tracking of GST or TDS on commission payments.
6. **No broker portal/login** — Brokers can't log in to see their deals, commission status, or submit leads. Everything is internal.
7. **No broker lead attribution** — When a lead's source is "BROKER", there's no field to link it to a specific broker record. The lead source is just an enum value.

### India-Specific Gaps

- **No TDS 194H on commission** — TDS must be deducted when paying broker commission (5% for individuals, 10% for companies). Not tracked.
- **No GST reverse charge on commission** — If broker is unregistered, GST under reverse charge mechanism applies. Not tracked.
- **No broker RERA registration number** — RERA requires agents to register. No field to capture broker's RERA registration number.

---

## Step 7: Review Portal Listings

### What I See

**Desktop (`/portal-listings` → redirects to `/units?tab=portal`):**

- `apps/web/src/app/portal-listings/page.tsx` (line 6): Redirects to the Units page with portal tab.
- `apps/web/src/app/units/page.tsx` (lines 41, 195-225): Portal listings are fetched and displayed as part of the Units Hub. Each listing shows: portal name, title, status (DRAFT/LISTED/DELISTED/SYNC_FAILED), asking price, unit details, RERA fields (carpet area, super built-up area, balcony area), bedrooms, bathrooms, furnishing, photos, listing URL, last synced at, sync error.
- Portal unit options: Available units that can be listed (AVAILABLE/HOLD status).
- Portal projects: Projects for listing context.

**Mobile (`/m/portal-listings`):**

- `apps/web/src/app/m/portal-listings/page.tsx`: Shows 4 stat cards (Listed, Draft, Failed, Delisted) and a list of portal listings with export/share functionality.
- `apps/web/src/app/m/portal-listings/new/`: New listing creation form.
- `apps/web/src/app/m/portal-listings/[id]/`: Listing detail with actions.

### What Works

- Portal listing CRUD with status tracking (DRAFT, LISTED, DELISTED, SYNC_FAILED).
- RERA fields captured (carpet area, super built-up area, balcony area) — critical for RERA compliance.
- Sync error tracking with `syncError` field and `lastSyncedAt` timestamp.
- Mobile support for on-the-go listing management.
- Auto-delist on sale completion (`delistPortalListings()` in sale.ts line 533).

### What's Broken or Missing

1. **No actual portal API integration** — The system tracks listing status but doesn't actually sync with 99acres, MagicBricks, or Housing.com APIs. All sync is manual.
2. **No listing performance analytics** — Can't track views, inquiries, or conversion rate per listing.
3. **No listing price suggestions** — No auto-suggest for asking price based on similar units or market data.
4. **No bulk listing** — Can't list multiple units on the same portal at once.
5. **No listing expiry tracking** — Portal listings often have a duration (30/90 days). No expiry tracking.
6. **No photo management** — Photos are stored but there's no photo ordering, caption, or watermarking feature.

### India-Specific Gaps

- **No RERA mandatory disclosures** — RERA requires specific disclosures on listings (project registration number, promoter details, land status, approvals). The listing form captures some RERA fields but doesn't enforce mandatory disclosures.
- **No carpet area pricing** — RERA mandates pricing on carpet area, not super built-up area. The invoice print page (`sale-invoice/[id]/page.tsx` line 164) uses `superBuiltUpArea` for pricing if available, which may not be RERA-compliant.

---

## Step 8: Check Calls / Telephony Dashboard

### What I See

**Desktop (`/calls`):**

- `apps/web/src/app/calls/page.tsx`: Two tabs — Call Log and Telephony.
- **Call Log tab** (`apps/web/src/components/calls/calls-view.tsx`):
  - Page header with stats: Total calls, Missed calls, Talk time.
  - "Log Call" button for manual call entry.
  - Filters: search (by number, name, notes), direction (inbound/outbound/internal), status (answered/missed/voicemail/failed), phone number.
  - Call list table: Direction icon, From→To (masked unless `canViewFullNumber`), Staff name, Status, Duration, Time, Recording (Play link), Tags.
  - Legal hold indicator for compliance.
  - Voicemail indicator.
  - Manual call form: direction, other party number, company number, duration, disposition (Connected, Voicemail left, Callback requested, Follow up, Deal closed, Complaint, Inquiry, Other), notes.

- **Telephony tab** (`apps/web/src/components/calls/telephony-view.tsx`):
  - Company phone numbers with provider, department, label, status, monthly cost, consent beep.
  - Telephony provider configs (webhook URL, active status).
  - Consent policy management (version, policy text, effective date, acceptances count).
  - Recording settings (consent beep, retention days, auto-delete, storage provider, recording mode).
  - Per-user recording toggle.

**Mobile (`/m/calls`):**

- `apps/web/src/app/m/calls/page.tsx` + `MobileCallsView.tsx`: Mobile call log view.
- `apps/web/src/app/m/calls/[id]/`: Call detail page.

**Telephony redirect** (`/telephony` → `/calls?tab=telephony`).

### What Works

- **Call logging**: Manual call entry with direction, number, duration, disposition, notes. Posts to `POST /api/calls`.
- **Call list with filters**: Search, direction filter, status filter, phone number filter.
- **Number masking**: `maskNumber()` function masks numbers unless user has `CALL_VIEW_FULL_NUMBER` permission.
- **Recording playback**: Link to call detail page for recording playback (if `canListenRecording` permission).
- **Twilio integration**: Webhook endpoints for voice (`/api/telephony/webhook/twilio/voice`) and status (`/api/telephony/webhook/twilio/status`). Call sync via `/api/telephony/twilio/sync-calls`.
- **Consent management**: Consent policy with versioning and acceptances tracking. Required for Indian call recording compliance.
- **Legal hold**: Calls can be marked with `legalHold` for litigation hold.
- **Call tags**: Tags with colors for categorization.
- **Per-user recording toggle**: `recordCalls` flag on UserCompany membership.
- **Recording retention**: Configurable retention days with auto-delete.

### What's Broken or Missing

1. **No call analytics dashboard** — No charts for call volume over time, peak hours, answer rate, average duration, disposition breakdown. Just raw stats (total, missed, talk time).
2. **No call-to-lead/customer linkage** — Manual call form doesn't link calls to leads or customers. Can't see "all calls made to lead X" or "call history for customer Y".
3. **No click-to-call** — No button to initiate a call from a lead or customer record. Tele-calling requires manually dialing and then logging.
4. **No call disposition workflow** — After a call, there's no prompt to set a disposition or schedule a follow-up. The disposition is set during manual logging but not after Twilio calls.
5. **No call recording transcript search** — Recordings have `transcriptStatus` but there's no UI to view transcripts or search across transcripts.
6. **No voicemail management** — Voicemail indicator exists but no UI to listen to or transcribe voicemails.
7. **No call queue/campaign management** — Can't create calling campaigns (e.g., "call all leads who haven't been contacted in 30 days") or manage call queues.
8. **Tags not functional in filter** — The `tags` prop is passed to `CallsView` but the eslint-disable comments (lines 99-101) suggest they're not used. No tag filter in the UI.

### What's Confusing

- The call list shows "Staff" column but it's not clear if this is the caller or callee. The code (line 238) shows `call.caller?.name ?? call.callee?.name ?? "—"` which is ambiguous.
- The "From → To" column shows the masked other party number, not the full from→to flow. It's not clear which direction the call went.

### India-Specific Gaps

- **No TRAI DND check** — Before making outbound calls, numbers should be checked against the DND registry. Not implemented.
- **No call recording consent beep verification** — The consent policy exists but there's no verification that the beep was actually played during the call.
- **No Indian phone number formatting** — Numbers are displayed as-is. No +91 prefix formatting or grouping (e.g., +91 98765 43210).
- **No SMS follow-up after call** — Indian sales practice often involves sending an SMS/WhatsApp after a call. No integration to auto-send a follow-up message.

---

## Step 9: Review Payment Schedule Editor (CLP Milestones)

### What I See

**In Sell Asset Dialog** (`sell-asset-dialog.tsx` lines 672-690):

- Payment Plan section with `PaymentPlanEditor` component.
- Schedule type selector: Time-Linked (TLP), Down Payment (DPP), Construction-Linked (CLP).
- Auto-generate button (appears when CLP + WBS nodes available, or TLP/DPP + deal maturity months set).

**In Sale Detail** (`sale-detail-dialog.tsx` lines 646-658):

- Payment schedule display with horizontal progress bar, legend, next-due banner, and installment table.
- "Edit" link opens `EditScheduleDialog`.

**Edit Schedule Dialog** (`edit-schedule-dialog.tsx`):

- Reuses `PaymentPlanEditor` pre-filled with current schedule items.
- Saves via `POST /api/sales/[id]/schedule` (create-or-replace).

**Payment Plan Editor** (`payment-plan-editor.tsx`):

- Schedule type dropdown (TLP/DPP/CLP).
- CLP mode: Shows WBS milestone count, fetches from `/api/wbs/nodes?projectId=X`.
- Installment rows: No., Description, %, Amount, Due Date (TLP/DPP) or Milestone dropdown (CLP).
- Add/Remove installment buttons.
- Total percentage and amount validation (must sum to 100%).
- Auto-generate:
  - CLP: One installment per WBS milestone, evenly distributed. First installment = booking advance if set.
  - TLP/DPP: Monthly installments over deal maturity months. First installment = booking advance if set.

### What Works

- **CLP-WBS milestone linkage**: Each CLP installment can be linked to a specific WBS milestone node via `wbsNodeId`. This is the correct approach for construction-linked payments.
- **Auto-generation**: Both CLP (milestone-based) and TLP (time-based) auto-generation work correctly with proper rounding fixes.
- **Percentage validation**: Ensures installments sum to 100% before submission.
- **Schedule editing**: Existing schedules can be edited post-creation via `EditScheduleDialog`.
- **Schedule persistence**: `POST /api/sales/[id]/schedule` creates or replaces the payment schedule.
- **Demand notice printing**: Each installment has a print link to generate a demand notice.

### What's Broken or Missing

1. **No CLP milestone completion trigger** — When a WBS milestone is marked complete (in the WBS/project management module), there's no automatic trigger to:
   - Set the installment due date
   - Change installment status to "DUE"
   - Generate a demand letter
   - Send a payment reminder to the customer
     This is a critical gap for CLP workflows.
2. **No installment-level GST** — `sale.ts` line 466: `scheduleGst = new Decimal(0)`. Each installment should have its own GST component for the demand letter to be compliant.
3. **No partial payment allocation** — When a payment is recorded, there's no UI to allocate it to specific schedule items. The `collectItem` state in `sale-detail-dialog.tsx` (line 50) suggests this was intended but the `PaymentDialog` is opened instead of a targeted collection.
4. **No schedule versioning** — When the schedule is edited, the old schedule is replaced entirely. No history of schedule changes.
5. **No schedule locking** — Once payments have been made against a schedule, editing the schedule could cause inconsistencies. There's no lock mechanism.
6. **No grace period tracking** — Indian real estate typically has a grace period (e.g., 15 days) after the due date before late payment charges apply. No grace period field.
7. **No late payment charges** — No automatic calculation of late payment interest/penalty for overdue installments.
8. **CLP due dates always empty** — `payment-plan-editor.tsx` line 139: CLP installments are created with `dueDate: ""`. The due date should be auto-set when the linked WBS milestone is completed.

### India-Specific Gaps

- **No RERA-mandated payment schedule validation** — RERA mandates that CLP payments be linked to construction milestones and that no more than 10% advance be collected. No validation against this.
- **No demand letter format compliance** — The demand notice print page exists but should follow the format prescribed by RERA (with project registration number, promoter details, etc.).
- **No TDS deduction per installment** — For CLP, the buyer should deduct 1% TDS on each installment (if sale > ₹50L). No per-installment TDS tracking.

---

## Summary of Issues Found

### 🔴 Broken (Non-functional)

1. **No sales quotation system** — The `/quotes` and `/m/quotations` routes redirect to procurement quotations, not sales quotations. There's no way to prepare a pre-sale quotation for a prospect.
2. **CLP due dates never set** — CLP installments are created with empty due dates. No mechanism to auto-set due dates when WBS milestones complete.
3. **Call tags not filterable** — Tags are displayed but the filter UI is disabled (eslint-disable comments on unused props).
4. **No CLP milestone → demand letter automation** — The linkage between WBS milestone completion and payment demand generation is missing.

### 🟡 Missing (Features that should exist)

1. **Standalone sales quotation** with unit price, CLP plan, T&C, GST breakdown, validity, PDF export
2. **Lead Kanban board** for visual pipeline management
3. **Lead source analytics** (conversion rates by channel)
4. **Bulk lead actions** (assign, stage change, delete)
5. **Lead import/export** (CSV from portals)
6. **Sale order approval workflow** (submit → finance approve → confirm)
7. **Sale cancellation reason** capture
8. **Formal lifecycle timeline view** (chronological event log)
9. **Document versioning and verification status**
10. **Broker performance analytics** (conversion rate, avg deal size)
11. **Broker commission slabs** (tiered commission rates)
12. **Broker RERA registration number** field
13. **Portal API integration** (actual sync with 99acres/MagicBricks)
14. **Call analytics dashboard** (volume charts, answer rate, disposition breakdown)
15. **Call-to-lead/customer linkage**
16. **Click-to-call** from lead/customer records
17. **Call campaign/queue management**
18. **Partial payment allocation** to specific schedule items
19. **Schedule versioning and locking**
20. **Grace period and late payment charges**
21. **Installment-level GST** tracking
22. **Stamp duty and registry fee calculators**
23. **Possession date tracking** (separate from registry date)
24. **Follow-up notifications** (push/email for overdue follow-ups)
25. **DND (Do Not Disturb) compliance** check

### 🟠 Confusing (UX Issues)

1. `/crm` and `/leads` both redirect to `/sales?tab=pipeline` — CRM is buried inside Sales
2. `WorkflowStrip` shows "Collection" and "Registry" as non-clickable steps
3. "Advance Amount" label is ambiguous (booking token vs down payment)
4. "Deal Maturity (months)" is unclear (payment duration vs possession timeline)
5. ATS/Registry toggle says "either/or" but they're sequential in practice
6. "BBA/ATS Signed" badge doesn't distinguish which document is uploaded
7. Payment schedule progress bar segments don't show installment numbers without hover
8. Call list "Staff" column is ambiguous (caller vs callee)
9. "From → To" column shows masked other party, not the full flow

### 🇮🇳 India-Specific Gaps

1. **❌ RERA 10% advance cap** — Not enforced. No validation on advance amount vs sale price.
2. **❌ BBA registration tracking** — BBA number captured but not whether it's registered with RERA.
3. **✅ GST on sale (1%/5%)** — Field present, auto-calculated, but no validation for correct rate by property type.
4. **✅ TDS 194IA** — Well-implemented. Auto-computes 1% for sales ≥ ₹50L. Certificate number tracked.
5. **⚠️ CLP milestone demand letters** — Print template exists but no automated generation workflow.
6. **✅ Cheque photo upload** — Fully implemented with clearing/bounce tracking.
7. **✅ Broker commission tracking** — Amount, paid status, GL posting all work.
8. **❌ TDS 194H on broker commission** — Not tracked. 5%/10% TDS on commission payments missing.
9. **❌ GST on broker commission** — Not tracked. Reverse charge mechanism for unregistered brokers missing.
10. **❌ Broker RERA registration** — No field for broker's RERA registration number.
11. **❌ Stamp duty calculator** — No auto-calculation by state.
12. **❌ Registry fee calculator** — No auto-calculation (typically 1%).
13. **❌ RERA mandatory disclosures on portal listings** — Not enforced.
14. **⚠️ Carpet area pricing** — Invoice uses super built-up area for pricing, may not be RERA-compliant.
15. **❌ DND compliance** — No TRAI DND check before outbound calls.
16. **❌ Indian phone number formatting** — No +91 formatting or validation.
17. **❌ Per-installment TDS tracking** — No per-installment TDS deduction for CLP.
18. **❌ Possession date in BBA** — RERA requires possession date in BBA. Not tracked separately.
19. **No RERA registration number on quotations** — Can't show RERA number on pre-sale documents (no quotation system exists).
20. **No e-sign integration** — Documents uploaded as photos, no digital signing.

---

## Key File References

| Area                         | File                                                     | Lines  |
| ---------------------------- | -------------------------------------------------------- | ------ |
| Sales page                   | `apps/web/src/app/sales/page.tsx`                        | 1-383  |
| Sales view                   | `apps/web/src/components/sales/sales-view.tsx`           | 1-502+ |
| Sell asset dialog            | `apps/web/src/components/sales/sell-asset-dialog.tsx`    | 1-841+ |
| Payment plan editor          | `apps/web/src/components/sales/payment-plan-editor.tsx`  | 1-335  |
| Sale detail dialog           | `apps/web/src/components/sales/sale-detail-dialog.tsx`   | 1-775+ |
| Complete sale dialog         | `apps/web/src/components/sales/complete-sale-dialog.tsx` | 1-295  |
| Edit schedule dialog         | `apps/web/src/components/sales/edit-schedule-dialog.tsx` | 1-120  |
| BBA pipeline board           | `apps/web/src/components/sales/bba-pipeline-board.tsx`   | 1-436  |
| Lead pipeline view           | `apps/web/src/components/sales/lead-pipeline-view.tsx`   | 1-179  |
| Lead form dialog             | `apps/web/src/components/sales/lead-form-dialog.tsx`     | 1-246  |
| Lead detail dialog           | `apps/web/src/components/sales/lead-detail-dialog.tsx`   | 1-302  |
| Lead dedup dialog            | `apps/web/src/components/sales/lead-dedup-dialog.tsx`    | 1-178  |
| Brokers page                 | `apps/web/src/app/brokers/page.tsx`                      | 1-76   |
| Brokers view                 | `apps/web/src/components/brokers/brokers-view.tsx`       | 1-307  |
| Calls page                   | `apps/web/src/app/calls/page.tsx`                        | 1-190  |
| Calls view                   | `apps/web/src/components/calls/calls-view.tsx`           | 1-430  |
| Portal listings (redirect)   | `apps/web/src/app/portal-listings/page.tsx`              | 1-7    |
| Units page (portal tab)      | `apps/web/src/app/units/page.tsx`                        | 1-349+ |
| Mobile CRM hub               | `apps/web/src/app/m/crm/page.tsx`                        | 1-150  |
| Mobile portal listings       | `apps/web/src/app/m/portal-listings/page.tsx`            | 1-114  |
| Sales API                    | `apps/web/src/app/api/sales/route.ts`                    | 1-280  |
| Sale detail API              | `apps/web/src/app/api/sales/[id]/route.ts`               | 1-459  |
| Leads API                    | `apps/web/src/app/api/leads/route.ts`                    | 1-101  |
| Quotations API (procurement) | `apps/web/src/app/api/quotations/route.ts`               | 1-152  |
| Sale service                 | `packages/services/src/sale.ts`                          | 1-565+ |
| Sale invoice print           | `apps/web/src/app/print/sale-invoice/[id]/page.tsx`      | 1-341  |
| Demand notice print          | `apps/web/src/app/print/demand-notice/[id]/page.tsx`     | 1-80+  |
| Sale booking form print      | `apps/web/src/app/sales/[id]/print/page.tsx`             | 1-60+  |
