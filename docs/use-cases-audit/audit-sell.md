# Sell Audit (§3.5) — Gauntlet Verification

> **Source**: `USE_CASES_AND_WORKFLOWS.md` lines 416–469 (§3.5 Sell)
> **Method**: Two-pass gauntlet (read → verify → re-read → verify) against the real codebase.
> **Date**: 2026-09-04

## Bookmark

- Source: `USE_CASES_AND_WORKFLOWS.md` §3.5 Sell (lines 416–469)
- Schema: `packages/db/prisma/schema.prisma`
- Services: `packages/services/src/sale.ts`, `material-sale.ts`, `tenancy.ts`, `renovation.ts`, `portal-listing.ts`, `sms-parser.ts`, `crm.ts`, `valuation.ts`, `gl-posting.ts`
- Web: `apps/web/src/app/api/` routes for sales, tenancy, portal, sms, material-sales; `apps/web/src/components/sales/`

---

## Per-Claim Verdicts

### UC-UNIT-01: BuiltUnit with type (FLAT/SHOP/PLOT), status (AVAILABLE/BOOKED/SOLD/RENTED), area, asking price.
- Pass 1: `schema.prisma:2538-2597` BuiltUnit; enums `BuiltUnitType` (2508-2518) = `BHK_1, BHK_2, BHK_3, BHK_4, SHOP, OFFICE, WAREHOUSE_UNIT, VILLA, OTHER`; `BuiltUnitStatus` (2520-2528) = `PLANNED, UNDER_CONSTRUCTION, AVAILABLE, RESERVED, HOLD, SOLD, RENTED`. area (2546) + askingPrice (2568) present.
- Pass 2: re-read spec L423 → no FLAT/PLOT type; no BOOKED status (uses RESERVED)
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: type FLAT/SHOP/PLOT; status .../BOOKED/...
  - Actual: type BHK_*/SHOP/OFFICE/...; status .../RESERVED/...

### UC-UNIT-02: RenovationProject linked to a unit; cost and status tracked.
- Pass 1: `schema.prisma:4815-4850` RenovationProject with builtUnitId, actualCost, status (RenovationStatus PLANNED/IN_PROGRESS/COMPLETED/CANCELLED); `renovation.ts:47,144` createRenovation/addRenovationCost
- Pass 2: re-read spec L424 → confirmed
- **VERDICT: CONFIRMED**

### UC-UNIT-03: Portal listings — sync to 99acres/MagicBricks/Housing via pluggable PortalProvider; DRAFT → LISTED → DELISTED.
- Pass 1: `schema.prisma:2606-2637` PortalListing; `PortalListingStatus` (2639-2644) = DRAFT/LISTED/DELISTED/SYNC_FAILED; `portal-listing.ts:17-21,407-427` PortalProvider interface + factory with NineAcresProvider/MagicBricksProvider/HousingProvider/Manual/Stub; `syncListingToPortal:522`
- Pass 2: re-read spec L425 → confirmed
- **VERDICT: CONFIRMED**

### UC-SALE-01: Book a unit — AssetSale with buyer, unit, deal price, advance, payment plan, broker, T&C.
- Pass 1: `schema.prisma:3392-3521` AssetSale has customerId, builtUnitId, salePrice, depositAmount, brokerId, paymentSchedule, terms; `sale.ts:174` sellAsset
- Pass 2: re-read spec L432 → all fields present
- **VERDICT: CONFIRMED**

### UC-SALE-02: Sale lifecycle — PENDING → DEPOSIT_RECEIVED → COMPLETED (enum); UI derives BOOKED → BBA_SIGNED → REGISTERED → COMPLETED from document fields.
- Pass 1: `AssetSale.saleStage` is `String @default("PENDING")` (schema:3415), not a Prisma enum; runtime values PENDING/DEPOSIT_RECEIVED/COMPLETED/CANCELLED in sale.ts (622,747,904). `AssetSale.status` is separate SaleStatus enum (PENDING/ACTIVE/CANCELLED).
- Pass 2: re-read spec L433 → lifecycle is a string stage, not typed enum; UI derivation not verifiable from schema/services alone
- **VERDICT: DISCREPANCY (MINOR)**
  - Expected: saleStage as an enum.
  - Actual: saleStage is a String with runtime values.

### UC-SALE-03: Document uploads per stage — ATS/BBA, sale deed, registry.
- Pass 1: `AssetSale` has atsDocumentUrl, bbaDocumentUrl, registryDocumentUrl, allotmentDocumentUrl (3446-3453); `completeSale` (831-930) requires registryDocumentUrl
- Pass 2: re-read spec L434 → confirmed
- **VERDICT: CONFIRMED**

### UC-SALE-04: T&C cost allocation — each component toggles borne by client or seller.
- Pass 1: `SaleExpense` model (3554-3569); `SaleExpenseHead` enum REGISTRY/STAMP_DUTY/TRANSFER/LEASE_RENT/GST/OTHER (3359-3366); `ExpenseBorneBy` enum CLIENT/SELLER/NA (3368-3372); `sellAsset` creates SaleExpense rows (403-428)
- Pass 2: re-read spec L435 → all six heads + 3-way toggle present
- **VERDICT: CONFIRMED**

### UC-SALE-05: Broker & commission — Broker master with default %; brokerageAmount + payment status tracked.
- Pass 1: `Broker` model (3598-3618) has defaultCommissionPercent; `AssetSale` has commissionAmount, commissionPaid, commissionPaidDate (3467-3474)
- Pass 2: re-read spec L436 → confirmed
- **VERDICT: CONFIRMED**

### UC-SALE-06: Payment plan — CLP, TLP, DPP.
- Pass 1: `PaymentScheduleType` enum CLP/TLP/DPP (schema:5801-5805); `createSalePaymentSchedule` (1567); `recordSchedulePayment` (crm.ts:579)
- Pass 2: re-read spec L437 → confirmed
- **VERDICT: CONFIRMED**

### UC-SALE-07: Real estate GST — Affordable 1%, non-affordable 5% on 2/3, commercial 18%.
- Pass 1: `crm.ts:695-726` computeRealEstateGst implements all three rules. BUT `sale.ts:301-303` sellAsset computes `gstAmount = salePrice * gstRate / 100` taking gstRate as raw input — NEVER calls computeRealEstateGst. No isAffordable/projectType fields in SellAssetInput.
- Pass 2: re-read spec L438 → helper exists + unit-tested but NOT wired into sale creation
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: sellAsset applies real-estate GST rules automatically.
  - Actual: GST supplied manually as gstRate; computeRealEstateGst not called.

### UC-SALE-08: Auto-delist on sale — sellAsset() sets all active portal listings to DELISTED.
- Pass 1: `delistPortalListings` helper (1521-1535) sets active listings to DELISTED. In sellAsset called ONLY in isImmediateFullPayment branch (533), not partial-deposit/no-payment branches. Also called in completeSale (898).
- Pass 2: re-read spec L439 → normal booking with only deposit does NOT delist
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: sellAsset() delists on every sale.
  - Actual: delisting only on immediate full payment or on completeSale().

### UC-PAY-01: Record sale payment — AssetSalePayment with mode, bank, cheque photo, amount.
- Pass 1: `AssetSalePayment` model (3523-3545) has mode, chequeBank, chequePhotoUrl, amount; `recordPayment` (sale.ts:1038-1204)
- Pass 2: re-read spec L446 → confirmed
- **VERDICT: CONFIRMED**

### UC-PAY-02: Bank SMS parsing — BankSms + /api/sms/ingest and match; auto-create payment entries.
- Pass 1: `BankSms` model (6161-6192); `ingestSms` (sms-parser.ts:155), `parseSms` (87), `matchPayment` (273); `/api/sms` + `/api/sms/match` routes exist. **CRITICAL**: matchPayment (315-321) and manualMatchSms (521-526) always call postPaymentReceived for ASSET_SALE (Dr Cash / Cr AR) even before completion. recordPayment (1141) and recordSchedulePayment (crm.ts:641) correctly use postDepositReceived for pre-completion. completeSale (944-964) settles Customer Deposits against AR — will not exist for SMS-matched pre-completion payments.
- Pass 2: re-read spec L447 → parsing/matching present but GL routing wrong for pre-completion
- **VERDICT: DISCREPANCY (CRITICAL)**
  - Expected: SMS-matched asset-sale payments follow same deposit/AR routing as recordPayment.
  - Actual: SMS auto-match always posts to AR (postPaymentReceived) regardless of saleStage, breaking completeSale's deposit/AR settlement.

### UC-PAY-03: Milestone payment due — PaymentScheduleItem auto-marks DUE when linked WBS node hits 100%.
- Pass 1: `boq.ts:350-368` updates PaymentScheduleItem to DUE when progressPct >= 100 or actualEnd set; `crm.ts:541-572` checkMilestonePayments
- Pass 2: re-read spec L448 → confirmed
- **VERDICT: CONFIRMED**

### UC-PAY-04: Send demand notices — auto email/SMS reminders when installments due.
- Pass 1: `sendPaymentDueReminders` (crm.ts:740+); `/api/cron/reminders/route.ts:52`; print demand-notice pages at `/print/demand-notice/[id]`
- Pass 2: re-read spec L449 → confirmed
- **VERDICT: CONFIRMED**

### UC-RENT-01: Create tenancy — Tenancy with unit, tenant, rent, start date, escalation %, interval, registered agreement upload.
- Pass 1: `Tenancy` model (4487-4556) has builtUnitId, tenantName, monthlyRent, startDate/endDate, escalationPercent, escalationIntervalMonths, rentAgreementDocumentUrl; `createTenancy` (106)
- Pass 2: re-read spec L456 → confirmed
- **VERDICT: CONFIRMED**

### UC-RENT-02: Monthly billing — Generate RentalPayment per month.
- Pass 1: `RentalPayment` model (4558-4585); `activateTenancy` (404-480) auto-generates monthly rows; `generateRentSchedule` (918-984)
- Pass 2: re-read spec L457 → confirmed
- **VERDICT: CONFIRMED**

### UC-RENT-03: Yearly escalation — escalationPercent applied every N months.
- Pass 1: `applyRentEscalation` (tenancy.ts:684-742) uses escalationPercent + escalationIntervalMonths; `processDueEscalations` (748-769)
- Pass 2: re-read spec L458 → confirmed
- **VERDICT: CONFIRMED**

### UC-RENT-04: Tenant change — end old tenancy, start new one with new rent.
- Pass 1: `changeTenant` (tenancy.ts:798-899) terminates old, refunds deposit, creates new active tenancy with newMonthlyRent
- Pass 2: re-read spec L459 → confirmed
- **VERDICT: CONFIRMED**

### UC-RENT-05: SAC GST — Rent falls under services (SAC), not HSN.
- Pass 1: `Tenancy.sacCode` (4512) default `997313`; `recordRentPayment` (583-643) looks up rate by sacCode + posts OUTPUT_GST using SAC code
- Pass 2: re-read spec L460 → confirmed
- **VERDICT: CONFIRMED**

### UC-MSALE-01: Sell material — MaterialSale with lines, customer, payment.
- Pass 1: `MaterialSale` (4625-4676), `MaterialSaleLine` (4704-4724), `MaterialSalePayment` (4678-4702); `createMaterialSale` (material-sale.ts:128)
- Pass 2: re-read spec L467 → confirmed
- **VERDICT: CONFIRMED**

### UC-MSALE-02: Link to project for cost recovery — projectId set; scrapSubtotal reduces project cost and each unit's productionCost.
- Pass 1: `MaterialSale` has projectId (4630) + scrapSubtotal (4637); `createMaterialSale` computes scrapSubtotal (217-219,244) + calls reallocateProjectCosts (322). BUT `reallocateProjectCosts` (valuation.ts:269-401) computes costRecovery from ScrapGenerationLine (322-329), NOT MaterialSale.scrapSubtotal. `postMaterialSale` (gl-posting.ts:725-727) credits COST_RECOVERY revenue for scrapSubtotal but does NOT reduce project WIP or BuiltUnit.productionCost.
- Pass 2: re-read spec L468 → scrapSubtotal recognized as revenue but project cost reduction uses different concept
- **VERDICT: DISCREPANCY (MAJOR)**
  - Expected: MaterialSale.scrapSubtotal reduces project cost and per-unit productionCost.
  - Actual: scrapSubtotal is revenue/cost recovery only; project cost reduction based on ScrapGenerationLine, not MaterialSale.scrapSubtotal.

---

## SECTION VERDICT — §3.5 Sell

| Metric | Count |
|---|---|
| Claims verified | 22 |
| CONFIRMED | 17 |
| DISCREPANCY | 6 (CRITICAL: 1, MAJOR: 4, MINOR: 1) |
| AMBIGUOUS | 0 |

### Ranked Discrepancies

1. **[CRITICAL] UC-PAY-02** — Bank SMS auto-match GL mismatch. `sms-parser.ts:316,521` always posts `postPaymentReceived` (Dr Cash / Cr AR) for ASSET_SALE regardless of saleStage. `completeSale` (sale.ts:944-964) expects Customer Deposits for pre-completion payments. Causes unbalanced trial balance. **Note**: `recordPayment` (sale.ts:1139-1155) and `recordSchedulePayment` (crm.ts:632-647) are CORRECT — the bug is ONLY in the SMS auto-match path.
2. **[MAJOR] UC-UNIT-01** — BuiltUnitType lacks FLAT/PLOT; BuiltUnitStatus uses RESERVED not BOOKED.
3. **[MAJOR] UC-SALE-07** — computeRealEstateGst exists + unit-tested but NOT wired into sellAsset; GST is manual input only.
4. **[MAJOR] UC-SALE-08** — sellAsset delists portal listings only on immediate full payment, not on standard deposit bookings.
5. **[MAJOR] UC-MSALE-02** — MaterialSale.scrapSubtotal does not reduce project cost or BuiltUnit.productionCost; only ScrapGenerationLine does.
6. **[MINOR] UC-SALE-02** — saleStage is a String, not a Prisma enum (runtime values enforced).

### Action Items

- **[CRITICAL] Fix SMS GL routing**: In `sms-parser.ts` matchPayment/manualMatchSms, inspect `sale.saleStage` before posting; use `postDepositReceived` for PENDING/DEPOSIT_RECEIVED and `postPaymentReceived` only for COMPLETED.
- **Wire computeRealEstateGst into sellAsset**: Add projectType/isAffordable to SellAssetInput; call computeRealEstateGst when assetType is BUILT_UNIT/PROJECT.
- **Reconcile BuiltUnitType/Status with spec**: Add FLAT/PLOT or update doc to BHK_*/SHOP/OTHER; add BOOKED or update doc to RESERVED.
- **Delist in sellAsset for all sale outcomes** (not just immediate full payment), or add a RESERVED-state delisting policy.
- **Make scrap material-sale recovery reduce project WIP**: Use MaterialSale.scrapSubtotal in reallocateProjectCosts so BuiltUnit.productionCost is reduced.
