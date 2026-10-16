# DECISIONS.md — Nirman Inventory OS Product Index

> **Read this first** (after `AGENTS.md`). This is the single routing layer that ties
> together every source of "what to build and why" so no session loses direction.
> It does NOT replace the detailed docs — it indexes them and tells you where to drill.
>
> **Last updated**: 2026-10-08 · **Maintainer**: update the status column each session.

---

## The one finding that matters most

**The schema is ~95% complete. The services are ~80% complete. The desktop UI exposes ~50%. The mobile UI exposes ~20%.**

Almost every workflow the owner described in the transcripts — land cost breakup, sale→BBA→registry lifecycle, NOC/permissions, rent with yearly escalation, broker + commission, cheque photos, 5-code attendance, H1–H6 hierarchy, construction-linked payment slabs — **is already modeled in the Prisma schema**. Many have service-layer business logic too.

The real work is **NOT "build new modules."** It is:

1. **Wire existing schema → UI** (the biggest gap by far)
2. **Enforce business flow sequences** in the UI (don't let users skip quotation→PO, sale→BBA→registry, attendance→DPR→approval)
3. **Build the 3–5 genuinely missing pieces** (traffic-light attendance, BOQ, HSN auto-fetch, DPR↔attendance rollup)
4. **Continue mobile UX polish** (the mega plan, in progress)
5. **Competitor parity** (lowest priority — owner voice wins over "4QT has it")

If you catch yourself planning to "build the rent module" or "add the sale lifecycle," **stop and check the schema first** — it's probably already there and just needs UI wiring.

---

## The three input sources

| Source                    | What it tells us                                                                                            | Where                                                                                                                                   | Authority                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Owner transcripts**     | How the business actually runs — the sequence, the mandatory fields, the document trail, the approval gates | `docs/source-material/USER_SESSION_BUSINESS_LOGIC.md` (distilled from `Alpha Road 1–5.txt`, `Amoria Cafe.txt`)                          | **Highest** — owner voice wins                     |
| **Competitor research**   | What 4QT/Tally/Zoho do screen-by-screen, and where Nirman has gaps vs them                                  | `docs/competitor-map/14-gap-analysis-vs-nirman.md` (actionable summary) + `PLATFORM_RESEARCH.md` (deep map)                             | Medium — parity for parity's sake is deprioritized |
| **UX research + testing** | Mobile UX scorecard (3.7/10 → 9/10), 12 principles, Playwright bug findings                                 | `docs/MOBILE_FLOW_MAP_BRAINSTORM_V2.md` (research) + `TESTING_FINDINGS.md` (bugs) + mega plan `~/.devin/plans/plan-3b8e1996af9d6943.md` | Medium — polish matters but after core flows work  |

**Priority rule (decided): owner voice wins.** If the owner explicitly asked for it in a transcript, it ranks above mobile UX polish and above competitor parity. If the owner didn't mention it, it ranks below.

---

## Status legend

| Tag                | Meaning                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| ✅ Done            | Wired end-to-end (schema → service → UI) and verified                            |
| 🔧 Wired in schema | Modeled in Prisma (+ maybe service) but NOT exposed in UI — the biggest category |
| 🚧 In progress     | Currently being worked on                                                        |
| ⬜ Not started     | Genuine new build or not yet touched                                             |
| 🐛 Bug             | Broken, found in testing                                                         |

---

## The ranked backlog

> Ranked by: owner-voice-wins, then by (business-criticality × UI-exposure-gap).
> Items marked 🔧 are the highest-leverage work — the schema is ready, the UI just needs wiring.

### Tier 0 — Owner-voice core flows (modeled, need UI wiring + flow enforcement)

| #   | Item                                                                                                                                               | Schema                                                            | Service                  | Desktop UI                                                                              | Mobile UI                                                                              | Evidence        | Backing ticket           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------- | ------------------------ |
| D1  | Sale lifecycle: Sale Order → ATS/BBA → Registry → Complete, with document uploads per stage                                                        | ✅ `saleStage`, `bbaDate`, `saleDeedNo`, `atsDate`                | ✅ stage transitions     | ✅ sale detail dialog with stage badges + ATS/BBA/Registry uploads + sale deed tracking | ✅ mobile `SaleLifecycleTimeline` + document uploads + registry gate                   | Transcript §3.5 | T06 (closed)             |
| D2  | Land cost breakup: base + lease rent (one-time/yearly) + GST + registration + stamp duty, all %-based with manual override                         | ✅ all fields + auto-calc                                         | ✅                       | ✅ desktop wizard + land hub                                                            | ✅ mobile wizard + detail + edit form                                                  | Transcript §2.3 | T05 (closed)             |
| D3  | NOC / Legal permissions tab on Land + Project (map sanction, fire NOC, airport NOC, etc.)                                                          | ✅ `LegalDocument` model, extensive                               | ✅ CRUD                  | ✅ land hub + project hub "Legal" tab                                                   | ✅ mobile `MobileLegalDocsSection`                                                     | Transcript §2.6 | —                        |
| D4  | Rent / Tenancy module: registered agreement upload, monthly billing, yearly escalation, tenant change                                              | ✅ `Tenancy`, `escalationPercent`, `escalationIntervalMonths`     | ✅ 1139-line service     | ✅ desktop `/rentals`                                                                   | ✅ mobile `/m/rentals`                                                                 | Transcript §6.1 | T14 (closed)             |
| D5  | Sales CRM: slab-based construction-linked payment milestones (booking → foundation → 4th slab → 10th slab), auto demand notices, broker management | ✅ `PaymentScheduleItem` with `wbsNodeId` for CLP, `Broker` model | ✅                       | ✅ desktop `/brokers` + payment plan editor                                             | ✅ mobile sale form + broker section                                                   | Transcript §6.2 | T14 + T06 (closed)       |
| D6  | Comparative Analysis UX on PO form: collect quotes → side-by-side → pick cheapest → PO auto-fills                                                  | ✅ `VendorQuote`, quote engine                                    | ✅ `quote-comparison.ts` | ✅ desktop has `ComparativeQuotePanel`                                                  | ✅ mobile `MobileQuotePanel` + enhanced `ConvertForm` with quote gate + winner display | Transcript §1.3 | T02 (closed, mobile gap) |
| D7  | T&C cost-allocation on sales: each cost component "borne by client or seller" toggle + manual free-text T&C                                        | ✅ `SaleTerm` with `borneBy`, `extraAmount`                       | ✅                       | ✅ `SaleExpenseGrid` + `SaleTermsEditor` in sell dialog                                 | ✅ mobile sale form                                                                    | Transcript §3.3 | T06 (closed)             |
| D8  | Printable sales order receipt (project, unit, deal price, advance, payment plan, T&C)                                                              | ✅ data exists                                                    | ✅ `amountInWords()`     | ✅ 3 print pages (form, invoice, draft/LOI) + payment receipts                          | ✅ mobile sale detail links to print                                                   | Transcript §3.2 | —                        |

### Tier 1 — Owner-voice HR flows (modeled, need UI wiring + 1 genuine new build)

| #   | Item                                                                                                                                                       | Schema                                 | Service                                                                                                  | Desktop UI                                                    | Mobile UI                                                        | Evidence            | Backing ticket   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------- | ---------------- |
| D9  | GPS-tagged attendance from phone (geofence check-in, field staff approval flow)                                                                            | ✅ `checkInLat/Lng`, `checkInLocation` | ✅                                                                                                       | ✅ desktop attendance view with GPS columns                   | ✅ mobile `MobileSelfCheckIn` with geolocation + geofence status | Transcript §5.1     | T13 (closed)     |
| D10 | **3-tier traffic-light attendance status** (🔴 absent / 🟡 present-no-DPR / 🟢 present+DPR-approved) — **GENUINE NEW BUILD** (codes exist, rollup doesn't) | ✅ codes exist                         | ✅ `computeAttendanceTier()` + `getAttendanceWithTiers()` + `getAttendanceTierCounts()`                  | ✅ attendance view "Tier" column with RED/YELLOW/GREEN badges | ✅ mobile HR dashboard                                           | Transcript §5.2     | T13 (closed)     |
| D11 | DPR↔attendance linkage: attendance stays yellow until manager approves DPR                                                                                 | ✅ `DprLaborLine` exists               | ✅ tier computation links DPR approval                                                                   | ✅ tier column reflects DPR approval                          | ✅ mobile attendance shows tier                                  | Transcript §5.2–5.3 | T13 (closed)     |
| D12 | 5-code attendance (P/H/Late/PL/NPL) + "4 lates = 1 half-day" rule + 85% half-day definition                                                                | ✅ all 5 codes + 85% comment           | ✅ `computeStatusFromHours()` + `computeLateHalfDayDeductions()` + `generatePayroll()` applies deduction | ✅ all 8 status codes in attendance view                      | ✅ mobile attendance form                                        | Transcript §5.5     | T13 (closed)     |
| D13 | Auto-salary calculation from attendance at month-end                                                                                                       | ✅ `generatePayroll()` in `hr.ts`      | ✅                                                                                                       | ✅ desktop `/hr/payroll` + `payroll-view.tsx`                 | ✅ mobile `/m/books/payroll` + `MobileGeneratePayrollDialog`     | Transcript §5.5     | T13 (closed)     |
| D14 | H1–H6 customizable HR hierarchy (assign any role to any level)                                                                                             | ✅ `hierarchyLevel` 1–6 on User        | ✅                                                                                                       | ✅ employees view + edit form with H1-H6 dropdown             | ✅ mobile employee form + detail                                 | Transcript §5.4     | T15 (closed)     |
| D15 | Team creation by seniors only (not self-sign-up)                                                                                                           | ✅ RBAC `canAssignRole`                | ✅                                                                                                       | ✅ user management uses `assignableRoles()`                   | ✅ mobile team list                                              | Transcript §5.4     | T10/T15 (closed) |

### Tier 2 — Owner-voice secondary (modeled, lower urgency)

| #   | Item                                                           | Schema                                                                                    | Service                                                                                                      | Desktop UI                                                                                                           | Mobile UI                                                                   | Evidence        | Backing ticket |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------- | -------------- |
| D16 | Per-plot valuation + asking price captured at partition time   | ✅ `askingPrice` + `currentValuation` on `LandParcel`                                     | ✅                                                                                                           | ✅ `ParcelValuationDialog` + land hub KPIs                                                                           | ✅ mobile land detail                                                       | Transcript §2.4 | T05 (closed)   |
| D17 | Possession flag on Land + Project                              | ✅ `isPossessed` on both                                                                  | ✅                                                                                                           | ✅ land hub possession badge + toggle button                                                                         | ✅ mobile land detail                                                       | Transcript §2.7 | T05 (closed)   |
| D18 | Owner-only subdivision undo (un-partition)                     | ✅ `LAND_UNPARTITION` action                                                              | ✅                                                                                                           | ✅ land hub unpartition button + API                                                                                 | ✅ mobile land detail                                                       | Transcript §2.4 | T05 (closed)   |
| D19 | Broker + commission tracking on sales                          | ✅ `Broker` model, `brokerageAmount`, `brokerId`                                          | ✅                                                                                                           | ✅ sell dialog "Deal Source" section + `/brokers` page                                                               | ✅ mobile sale form broker section                                          | Transcript §3.1 | T06 (closed)   |
| D20 | Cheque photo + bank + payment mode on sales/payments           | ✅ `chequePhotoUrl`, `paymentMode`                                                        | ✅                                                                                                           | ✅ `ChequeFields` component in sell dialog                                                                           | ✅ mobile `MobileChequeFields`                                              | Transcript §3.1 | T06 (closed)   |
| D21 | Purchase lifecycle mirror (PO → BBA/ATS → Registry → Complete) | ✅ `purchaseStage` BOOKED/BBA_SIGNED/REGISTERED/COMPLETED/CANCELLED + BBA document fields | ✅ `completeLandPurchase()` + `uploadLandPurchaseDocument()` with stage transitions + token payment tracking | ✅ land hub + land view + land detail drawer with stage badges + BBA/ATS/Registry document uploads + complete dialog | ✅ mobile land list + detail with stage badges + BBA upload + complete flow | Transcript §3.6 | T02 (closed)   |
| D22 | Land type Freehold vs Leasehold                                | ✅ `LandType` enum                                                                        | ✅                                                                                                           | ✅ desktop wizard + land hub                                                                                         | ✅ mobile wizard + detail + edit form                                       | Transcript §2.2 | T05 (closed)   |

### Tier 3 — Genuine new builds (not in schema)

| #   | Item                                                                                 | Status                                                                                                                           | Evidence        | Backing ticket |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------- |
| D23 | BOQ (Bill of Quantities) per project — optional, engineer estimates pre-construction | ✅ Done (BoqItem model + service + desktop + mobile)                                                                             | Transcript §7   | —              |
| D24 | HSN/SAC auto-fetch from government GST portal                                        | ✅ Done (pluggable provider: CBIC free snapshot + FastGST API; integration config + API route + 9 unit tests)                    | Transcript §1.1 | —              |
| D25 | Standard cost "pull from previous purchase" on material form                         | ✅ Done (desktop + mobile)                                                                                                       | Transcript §1.1 | T03            |
| D26 | Generic document-attachment infrastructure (polymorphic, any entity)                 | ✅ Done (EntityAttachment model + API + AttachmentList component, wired into sale/land/project detail pages on desktop + mobile) | Transcript §4.1 | —              |

### Tier 4 — Mobile UX polish (mega plan, in progress)

> These are NOT owner-voice items — they're UX research-driven. They rank below Tier 0–3
> per the owner-voice-wins rule, BUT several are in-flight and low-cost to finish.

| #       | Item                                                                                   | Status                                                                                                                                                                              | Evidence           |
| ------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| M1      | Global Search + Search Backend                                                         | ✅ Done (Phase 1)                                                                                                                                                                   | mega plan §1.1     |
| M2      | Recent Items / "Jump Back In"                                                          | ✅ Done (Phase 1)                                                                                                                                                                   | mega plan §1.2     |
| M3      | Sticky Submit Button on All Forms                                                      | ✅ Done (Phase 1)                                                                                                                                                                   | mega plan §1.3     |
| M4      | "View This Entity" After Creation                                                      | ✅ Done (Phase 1)                                                                                                                                                                   | mega plan §1.4     |
| M5      | Wire the Barcode Scanner                                                               | ✅ Done (Phase 1)                                                                                                                                                                   | mega plan §1.5     |
| M6      | Fix Dead-End Navigation Links                                                          | ✅ Done (Phase 1)                                                                                                                                                                   | mega plan §1.6     |
| M7      | Auto-Save Drafts on ALL Forms                                                          | ✅ Done (Phase 1)                                                                                                                                                                   | mega plan §1.7     |
| M8      | Long-Press Contextual Menu                                                             | ✅ Done (Phase 2)                                                                                                                                                                   | mega plan §2.1     |
| M9      | Swipe-to-Act on All Approval Lists                                                     | ✅ Done (Phase 2)                                                                                                                                                                   | mega plan §2.2     |
| M10     | Migrate Action Bars to Optimistic Updates                                              | ✅ Done (gate pass list)                                                                                                                                                            | mega plan §2.3     |
| M11     | Snooze on Attention Items                                                              | ✅ Done (attention banner + approvals queue)                                                                                                                                        | mega plan §2.4     |
| M12     | Smart Form Defaults                                                                    | ✅ Done (wired to PO, transfer, requisition, sale forms)                                                                                                                            | mega plan §2.5     |
| M13     | Photo Capture on All Field Entities                                                    | ✅ Done (gate pass exit photos, DPR, attendance, sales, land)                                                                                                                       | mega plan §2.6     |
| M14     | GPS Auto-Select Project                                                                | ✅ Done (useNearestProject hook + DPR + attendance forms)                                                                                                                           | mega plan §2.7     |
| M15     | Module-Level Error Boundaries                                                          | ✅ Done (Phase 2)                                                                                                                                                                   | mega plan §2.8     |
| M16     | Load More Pagination on All List Pages                                                 | ✅ Done (procurement, dprs, transfers, sales, requisitions)                                                                                                                         | mega plan §2.9     |
| M17–M23 | Phase 3 magical features (voice, briefing, photo-DPR, push, QR, portal, batch-approve) | ✅ Done (voice ✅, QR ✅, batch-approve ✅, briefing ✅, push ✅, portal ✅, photo-DPR ✅ — OCR provider with OpenAI Vision/Google Vision/Azure DI/stub + API route + 2 unit tests) | mega plan §3.1–3.7 |

### Tier 5 — Competitor parity (lowest priority per owner-voice-wins)

> See `docs/competitor-map/14-gap-analysis-vs-nirman.md` for the full P0–P3 table.
> These are deprioritized unless they overlap with an owner-voice item above.

---

## What to work on next (recommended order)

> **Status as of Oct 8 recheck**: D1–D26 and M1–M23 are implemented, but the live UI audit reopened cross-cutting role-fit, trust, and navigation work. Feature completion is not adoption closure.
> The schema is ~100% complete. All external integrations are scaffolded with
> pluggable providers (Tally, WhatsApp, Email, Portals, HSN/SAC, OCR). Prioritize the verified workflow follow-ups below before adding more modules.

0. **Management planes (done 2026-09-16)** — the three-layer management loop:
   - _Developer_: ErrorLog triage (fingerprint dedupe, occurrence counts,
     resolve → auto-reopen on regression), `/dev/errors` + `/m/dev/errors`
     console, server-500 capture into ErrorLog via apiHandler, in-app notify
     of DEVELOPER on new signatures.
   - _Company_: auto-audit — every successful API mutation now writes an
     AuditLog row (entity derived from path, pruned response body as `after`),
     so `/finance/audit` + `/m/settings` activity feeds show real "who did
     what". `onBehalfOfId` records delegated actions.
   - _Authority handoff_: `UserCompany.approvalsDelegatedTo*` — members
     delegate their authority until a date (settings + /me + /m/me card);
     delegates act with their own role, plus only the delegated approval permissions (getUserPermissions union)
     and their acting role stays their own (Slice 6a): delegation never lifts a role. Daily
     `/api/cron/approval-aging` (scheduled via scheduler.sh)
     digests each approver only the stalled items they can act on (their scope, their permissions incl. hats and delegation, the self-approval rule and PO value tiers) — threshold is
     `Company.approvalAgingHours` (default 48h, editable in company
     settings desktop + mobile). The run also prunes resolved ErrorLogs
     > 30d. Leave approval nudges approvers to delegate before going away.
     > Pulse shows oldest-pending age; mobile approvals queue renders a
     > per-item waiting chip (amber ≥24h, red ≥48h).
1. **Cross-cutting refinement** — per `global_rules.md`, refine every page/button
   to function correctly end-to-end (frontend ↔ backend ↔ database). A multi-pass
   audit (committed ~50 fixes) covered: every business flow end-to-end + DB/GL,
   permission/scope/tenancy on client + server, offline queue, form drafts,
   timezone/concurrency handling, notification routing, approval escalation, and
   per-role duty-fit. See git history for the fix ledger.
2. ~~UI wiring for new integrations~~ — **done.** HSN/SAC search (`HsnSacSearch`
   autocomplete → `/api/hsn-gst`) is on the material form + supplier-invoice form,
   auto-filling HSN + GST; OCR photo-extract (`Scan` → `/api/ocr/dpr`) fills DPR
   material lines from a site photo.
3. **Seed data completeness** — enriched with DPRs, payroll, tenancies, payment
   schedules, brokers. Consider adding more variety for testing edge cases.
4. ~~**Role-aware overdue delivery follow-up (S2)**~~ — **done 2026-10-08.** Overdue queue is role-aware (chase vs receive vs flag), queue item rows deep-link to the record, PO detail shows expected date + overdue days + tracked Call supplier + audited Update ETA (`updatePurchaseOrderEta` service, `updateEta` PATCH). Remaining tail: a “flag to procurement” escalation path for view-only users is copy-level, not a notification — add only if field users ask for it.
5. ~~**Zero-stock selection (S2)**~~ — **done 2026-10-08.** `SelectorModal` gained disabled rows with a spoken recovery hint; mobile stock-out fetches availability eagerly (source pick + picker open + post-submit refresh), warns over-qty lines inline, and pre-guards submit per material + lot; sale form's location picker + submit got the same treatment; desktop issue dialog now says "will be rejected" (the old "negative stock" copy was false) and blocks early. Fail-open on fetch error — server remains authoritative.
6. ~~**Master-data hygiene (S3)**~~ — **confirmed + cleaned 2026-10-08.** "QA Spine MPO36J"/"MPR5YT" (CEM-001/CEM-002, created 2 min apart Sep 29) and "X" (SW-1, Oct 7) are test artifacts — zero stock, zero PO/issue/movement refs; only an APPROVED same-day QA indent (REQ-…0003) references one. Soft-deleted in the dev DB with matching `MATERIAL_DELETE` audit rows (reversible via the material-restore path). **Production unverified** — SSH unreachable from this environment; check for the same residue on the VPS before launch.
7. ~~**Full web verification**~~ — **done 2026-10-08. Suite green: 2524/2524 (235 files).** The 17 remaining failures were all stale expectations, not product bugs: (a) 5 middleware tests asserted the intentionally-removed `/m→desktop` reverse redirect — rewritten to assert the first-class mobile surface, and the stale middleware docstring corrected; (b) 6 form-dialog tests queried `container` for nodes that live in `document.body` via the Dialog portal — now query `document`; (c) 5 sales print-page tests lacked an `assetSale` scope-check stub — added; (d) 1 backdrop test same portal issue. No product behavior changed.
8. ~~**APPROVED-PO receive dead end (S2)**~~ — **done 2026-10-08.** A truck arriving before anyone clicked "Mark ordered" stranded the receiver (PO invisible in the picker, service hard-rejected, desktop said "View PO →"). `receiveGoods` now accepts APPROVED and auto-flips it to ORDERED inside the receipt transaction with `auto: "ordered-on-first-receipt"` audit; all receive surfaces (field picker `/m/site/field`, `/api/goods-receipts?receivable`, receive-goods-dialog, desktop + mobile PO detail buttons) include APPROVED. Verified live end-to-end on dev: GRN posted, ORDER + RECEIVE audit rows, stock +10 kg. Also fixed: `convertRequisitionToPo` now blocks when a line's material was soft-deleted after approval (was silently minting dead PO lines).
9. ~~**Indent recovery path unreachable for field roles (S2)**~~ — **done 2026-10-08.** `/m/requisitions/new` was manifest-gated `procurement.manage`; SITE_ENGINEER holds `requisition.create` (the API + page gate were already right). Manifest perm corrected — verified the form renders for SITE_ENGINEER. `SelectorModal` gained `disabledAction` so zero-stock toasts carry a tappable "Raise indent →" button (stock-out picker + submit guard). "At a glance" dropped its "Pending actions" KPI (pure repeat of the queues) and the fake "-1%" low-stock delta.
10. ~~**Expense-claim filing unreachable for field roles (S2)**~~ — **done 2026-10-08.** Same manifest-vs-API split as the indent nav: `/m/expense-claims` list + detail were gated `finance.view`, `/new` on `expense.create` — SITE_ENGINEER/STORE_KEEPER hold only `claim.create`, so they couldn't file or track a reimbursement even though the API + both pages were already scoped correctly (claim.create → own claims only; self-approve blocked). Manifest perms now `claim.create` for all three; a "Claim" quick action added for field/ops/hr personas. Verified live: SE sees only their own claims (₹2.4K paid + ₹1.2K pending).
11. ~~**Expense-claim filing unreachable for field roles (S2)**~~ — **done 2026-10-08.** Same manifest-vs-API split as the indent nav: `/m/expense-claims` list + detail were gated `finance.view`, `/new` on `expense.create` — SITE_ENGINEER/STORE_KEEPER hold only `claim.create`, so they couldn't file or track a reimbursement even though the API + both pages were already scoped correctly (claim.create → own claims only; self-approve blocked). Manifest perms now `claim.create` for all three; a "Claim" quick action added for field/ops/hr personas. Verified live: SE sees only their own claims (₹2.4K paid + ₹1.2K pending).
12. ~~**Manifest-perm drift (whole-route sweep)**~~ — **done 2026-10-08.** Swept all 187 manifest routes against each page's own `perm=` gate: 7 more drifts beyond claims/indent. Over-gating: `/m/expense-claims`×3 (claim.create). Over-showing (nav surfaces a page that then rejects): `/m/change-orders`×2 + `/m/work-orders`×2 said `projects.view` but pages gate `assets.view`/`wo.manage`; `/m/subcontractors`×3 said `projects.view`/`projects.manage` but pages gate `procurement.view`/`procurement.manage`; `/m/rentals`×2 said `rentals.view` but tenancy pages gate `sales.view`; `/m/books/receipts/[id]` `finance.view`→`sales.view`; `/m/site/attendance` `hr.view`→`attendance.log` (equivalent today, precise for bespoke roles). Deep links still render for wider page gates (e.g. RA approvers → /m/work-orders/[id]); the manifest controls nav/search reachability only. 124 nav tests green. Quick-action sweep found one trap: `/m/work-orders` list opened on `assets.view` (all field roles) but every row linked to a detail gated `wo.manage`/`ra.*` — a clickable list of unreadable records. The detail now accepts `assets.view` for read-only viewing (every action stays canManage/canSubmit/canApprove/canPay-gated); consistent with the list already serving advance/retention figures to the same viewers, and with field users already seeing PO unit costs via procurement.view.
13. ~~**Task "Blocked" was unreachable dead UI**~~ — **done 2026-10-08.** The mobile task list queried `status in [PENDING, IN_PROGRESS, BLOCKED]`, rendered a Blocked stat/section/filter chip + a Resume button — but `taskStatusSchema` had no BLOCKED value and nothing could write it, so all of it was dead code and a field user had no way to say "this is held up" (only Cancel, which reads as abandoned). Added BLOCKED to the status enum, a `note` field on `updateTaskStatus` recorded into the activity feed ("…marked this task blocked — Waiting on TMT delivery"), and a Block action on PENDING/IN_PROGRESS rows that prompts for the reason (`usePrompt`, optional). Resume → IN_PROGRESS still runs the dependency check. Verified live: PENDING → Block w/ reason → BLOCKED section → Resume → IN_PROGRESS.
14. ~~**Hazard reporting locked to safety.manage**~~ — **done 2026-10-08.** The SECURITY_GUARD — the person at the gate most likely to spot an unguarded edge or a loose cable — held `safety.view` but not `safety.manage`, so the Report Hazard FAB never rendered and the POST rejected at the API. Hazard reports are observations, not regulated records — POST now accepts `safety.view` (scope + attachments asserted); incidents/inspections stay `safety.manage`. Three-layer fix: POST perm, unconditional scope-filtered project load, `canCreateSafetyItem` action flag → `safety.view`. Caught + fixed a leak: the widened flag passed as `canManage` also leaked incident/inspection FABs — re-anchored to real `canManage`. **Verified end-to-end as a real SECURITY_GUARD** (demo login): FAB renders, form opens with his scoped project, POST succeeds (HZD-261008-0001 in list); incident/inspection FABs absent.
15. ~~**Equipment fuel/usage logging locked to assets.manage**~~ — **done 2026-10-08.** Same class as hazard reporting: `Log Fuel` (the diesel-leakage capture — the operator records the meter, not the asset manager) sat inside the detail page's one `canManage` strip alongside Assign/Return/Maintenance/Retire. No field role holds `assets.manage`, so nobody on site could log run-hours or fuel. POST `/api/equipment-usage` → `assets.view` (scope assertion + `loggedBy` attribution unchanged); the button strip now renders Log Fuel for any viewer, while Assign/Maintenance/Retire stay `canManage`. **Verified end-to-end as SITE_ENGINEER** (`assets.view`, no manage): Log Fuel button renders alone (no Assign/Maintenance/Retire), the dialog submitted 6hrs + 20L diesel, row committed attributed to him.
16. **Challan-OCR receive pilot (thesis: photo-first front door)** — **built 2026-10-08.** `OcrProvider.extractChallan` reads the supplier's delivery challan photo (OpenAI vision; Google/Azure fall back to raw-text heuristics; stub returns empty). `/api/ocr/challan` gates on the same perms as the GRN write. `/m/site/field` has a "Challan" camera button beside barcode Scan — extracted lines fuzzy-match the PO's material names, prefill quantities, and fill challan/vehicle numbers; unmatched names are named in the toast; OCR is advisory only (receiver verifies goods, over-qty guard + server validation still run). Parser unit tests added (25 pass). **To try it live, configure the OCR integration** (Settings → Integrations → OCR → openai/google/azure + API key); without one the button degrades honestly to "enter quantities manually."
17. ~~**Picker/label confusion sweep (the "select something but no option" class)**~~ — **done 2026-10-08.** `SelectorModal` gained a `loading` prop (spinner instead of flashing the empty state while a fetch is in flight — stock-out + vehicle-capture wired; the latter's fake selectable "Loading…" row removed). Empty catalogs now read "Nothing here yet" + the passed `emptyHint` instead of "No results" (which read as a search miss); the `id=""` placeholder row no longer hides the empty state. `MobileSelectWithCreate` derives the sheet title + "Create new X" label from the placeholder when `label=""` (DPR project picker previously opened a title-less sheet). All 9 shared entity selectors now pass `createEntity` — the "Create new" button only renders when the POST would succeed (a security guard no longer sees "Create new project"). `/m/requisitions/new` empty state is role-aware: create CTA only for `projects.manage` holders; scoped field users get "ask your admin to add you". Stock-out got per-entity `emptyHint`s. Text dedup: `/m/site/field` dropped its in-page "Receive" heading (shell title already says it), `/m/notifications` dropped its eyebrow, settings company banner dropped the role (PROFILE badge below already shows it), `/m/site` DPR banner's title/subtitle no longer repeat the module name, `/m/me` relabeled the RBAC row "Access" (the hero shows the HR designation — same-word labels for different things read as contradictory). Desktop shells dropped the duplicated "⌘K to search anything" footer (topbar already shows it).
18. ~~**Duplicated/ambiguous labels (the "symmetric duplicates" class)**~~ — **done 2026-10-08.** Self vs crew check-in conflation: shift-rail "Check in"/"Check out" rows showed _self_ state but linked to `/m/site/attendance` (crew marking) — now status-only, pointing at the self check-in widget above. `/m/site/dpr` + `/m/site/attendance` dropped in-page headings the shell already renders ("New DPR" + spelled-out "Submit Daily Progress Report" read as the same phrase twice). Equipment detail dropped its in-page name line (shell title = entity name). `/m/queue` suppressed the status caption when the queue is empty (it stacked with the empty state saying the same thing). Attendance summary bar used letter codes with `title` tooltips — unreachable on touch, and "L" was ambiguous (Late vs Leave); now uses the same full-word `STATUS_CONFIG` labels as the per-row chips. All-pages picker deduped: 12 routes carry `redirectTo` with a non-redirect kind and rendered twice under the same title ("Approvals", "Expenses", "Receive", "My Profile", "Notifications"…); it now skips `redirectTo` routes and dedupes by title. NavSheet groups fell back to the raw module id when a parent path wasn't in ROUTE_BY_PATH — rendered a lowercase "home" title inside Home & Dashboards; now falls back to the module's human label. `/m/settings/notifications` retitled "Notification Settings" (admin templates, not the personal inbox). Field persona's "HR / Leaves" quick link → "Leaves" (the "HR /" prefix read as admin jargon).
19. ~~**Shell-vs-page duplicate headers (continuation of #18)**~~ — **done 2026-10-09.** The mobile shell's drill-down header resolves a detail title from `PageContextProvider` (`label` = entity identity, `subtitle` = project/supplier context). Detail pages were independently rendering the same strings inside their hero cards and in-page `<h1>`s — every record's name/number appeared twice, stacked. Swept **26 pages across 4 rounds**: `DetailHeroCard.title` made optional (icon/status/action still render without it); dropped hero titles where they verbatim-repeated the shell label (materials, suppliers, requisitions, expense-claims, material-issues, expenses, budget-variance, project-control, leads, projects, units, scrap, supplier-returns, receipts, equipment); kept titles that carry different info (work-order `workTitle`, BOQ `description`, rate-contract `material.name`, safety/NCR titles — the shell only has the doc number); trimmed hero subtitles/footnotes that repeated the shell subtitle (hazards, incidents, inspections, NCR, work-orders, measurement-book, change-orders, wbs, standard-consumptions); dropped custom in-page headers duplicating the shell back + title on customers, sales, material-sales, workflows, calls, hr/employees, hr/pending, settings/export, settings/notifications. The four `/new` forms (leads, brokers, subcontractors, workflows) rendered their own back+title+dept badge in page mode — removed (they already hid in modal mode; the wizard's _step-back_ is preserved as wizard navigation, not page chrome). Kept: functional links inside subtitles (PO's supplier link), "Stock Transfer" doc-type title (identity is the `from → to` route, not the entity name), `/m/me` username + `/m/units` scope headers (different from "My Profile"/"Built Units" shell titles), alert-banner + standing-chip pairs (contextual vs persistent affordances).

20. ~~**Field-role reachability + stale-seed posting + notification cuid leaks**~~ — **done 2026-10-09.** Verified the expense-claim loop end-to-end live (SE submit → owner notified → approve → GL post → claimant notified). Three real gaps found and fixed: (a) `postJournalEntry` threw `GL account X not configured` for any company whose chart was seeded before a code was added — every posting action dead permanently; now `ensureGlAccount` upserts known system accounts inside the posting transaction (its own docstring's purpose), and the throw remains only for codes absent from the chart entirely. (b) Expense-claim notifications rendered the raw Prisma cuid as `claimNumber` — claims have no human number, and the notification row already deep-links; dropped the variable from all four emit sites + templates. (c) The SECURITY_GUARD's tab bar backfilled to Home/Field/More/My Profile — the field persona's preferred tabs (/m/dprs, /m/stock) all fail his perm set, so his one job surface (/m/gate-pass, verified gate_pass.view+exit on the role) was 4 taps deep in the catalog; `/m/gate-pass` added to TAB_BACKFILL ahead of the utility screens (fills a slot only for perm-holders whose preferred tabs under-fill — engineers/execs unaffected). Also: payslip print was missing from the /m/print dispatcher while three mobile callers linked the _desktop_ /print path (My Pay card, payroll list, employee detail — now all /m/print/payslip); desktop approvals subtitle said "POs and indents" though the queue covers 8 entity types; ⌘K had no first-class "Expense claims" action (claims only matched via a description substring — added, pointing at /finance?tab=claims); the NoAccess denied-state pointed users at "Setup → Who Sees What" (project _scoping_, not module grants) — now names the real destinations (desktop Settings → Users, mobile Settings → Company details → team); raw-enum sweep — status/type/mode values rendered verbatim in 10+ spots including two print documents (measurement-book, stock-counts) and a printed RA-bill template — all routed through `formatEnumLabel`; new shared `formatUnitTypeLabel` maps BHK_2 → "2 BHK" (the map was duplicated in 3 files). Verified live as SECURITY_GUARD: tab bar = Home/Field/Gate Pass/More Task loop was silent — createTask/updateTaskStatus/reassignTask audited but never notified: new TASK_ASSIGNED/COMPLETED/BLOCKED events ping assignee + assigner respectively (verified live end-to-end; self-completions correctly suppress self-notify); task-card priority rendered lowercase next to capitalized status — fixed. Notification event sweep: 12 enum types existed but were never emitted — wired 7 (TASK_ASSIGNED/COMPLETED/BLOCKED, EXPENSE_CREATED, PROJECT_COST_ADDED, CUSTOMER_DEPOSIT_RECEIVED, UNIT_LISTING_SYNCED) + 2 cron sweeps (SUPPLIER_PAYMENT_DUE, CAPA_OVERDUE) into the 15-min reminders job; the rest deliberately skipped (STOCK_ISSUE_CREATED duplicates GATE_PASS_SUBMITTED for the same audience; transfer-create is DRAFT noise; no manual price-set action; no maintenance-schedule data). Preference grid covered only 30 of 80 event types — now lists all of them grouped by module so every notification is mutable per-channel. Voice-agent had no fallback when SpeechRecognition was absent (denied mic, iOS webview) — tapping the mic now opens a type-your-question sheet on the same /api/assistant pipeline; verified live the API returns real Hinglish answers., search "gate" → Gate Pass, /m/gate-pass renders with view+exit only.

---

## How to use this doc

- **Starting a session?** Read `AGENTS.md` (conventions) → this file (what to work on) → the evidence link for your chosen item.
- **Finished an item?** Update its status row here AND the backing wayfinder ticket (if any).
- **Found a new gap?** Add it to the appropriate tier with evidence pointer. Check the schema first — it's probably already modeled.
- **Tempted to build a "new module"?** Re-read "The one finding that matters most" above. Verify the schema doesn't already have it.

---

## Design decisions

### PO workflow: DRAFT → APPROVED (no SUBMITTED step)

Purchase orders go directly from DRAFT to APPROVED, while requisitions have a
SUBMITTED step (DRAFT → SUBMITTED → APPROVED). This is intentional:

- **POs** are created by procurement managers who know what they want to order.
  DRAFT means "saved, awaiting approval." There's no separate "submit for
  approval" action — the act of saving a draft PO puts it in the approval queue.
- **Requisitions (indents)** are created by site engineers who need to explicitly
  hand off to an approver. DRAFT means "still being edited." SUBMITTED means
  "I'm done, please review." This two-step flow prevents half-finished indents
  from clogging the approval queue.

Adding a SUBMITTED step to POs would be a schema change with no business value.
The self-approval guard (creator cannot approve their own PO) is enforced at
the service layer regardless of whether there's a SUBMITTED step.

### Direct registry and automatic PO approval (2026-10-06)

- Standalone LAND sales may complete with a registry document without a separate
  ATS/BBA. Units, whole projects, and project-linked land retain agreement gating.
  `@nirman/services/sale-policy` is the shared browser-safe rule. A missing RERA
  number is not treated as proof of exemption. This is a conservative application
  default, not a legal applicability determination. RERA Section 13 covers plots
  as well as apartments/buildings; the registered conveyance and an agreement to
  sell are different documents under Transfer of Property Act Section 54.
- Final payment omission means “record the remaining balance”; an explicit zero
  means “no new payment”. Completion and payment settlement are separate states:
  unpaid amounts remain receivables and the returned payment status must match
  the persisted status. No payment confirmation is sent when no payment was made.
- Selecting a requisition quote creates a DRAFT PO attributed to its purchaser.
  Automatic approval/order must use the same `approvePurchaseOrder` service as
  manual approval, including self-approval and value-based authority checks. A
  denied auto-approval leaves a linked draft for the eligible reviewer; it must
  not be described as ordered. Awarding requires approved indents, distinct
  supplier bids or a recorded waiver, and a reason for a higher-priced winner.

---

## Source documents (for drill-down)

| Doc                                     | Path                                                  | When to read                                                                                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent conventions                       | `AGENTS.md`                                           | Every session, first                                                                                                                                                                                                         |
| Doc index                               | `docs/README.md`                                      | To find the right doc by the question you're asking                                                                                                                                                                          |
| Production-readiness review             | `docs/PRODUCTION-READINESS.md`                        | To answer "is this enterprise-grade" — every launch question + the gap ledger                                                                                                                                                |
| System-design deep dive                 | `docs/SYSTEM-DESIGN-DEEP-DIVE.md`                     | The hard questions — concurrency, idempotency, consistency, races — answered with code evidence                                                                                                                              |
| Runbook                                 | `docs/RUNBOOK.md`                                     | When something's broken in prod                                                                                                                                                                                              |
| SLOs / error budget                     | `docs/SLO.md`                                         | Before promising reliability numbers                                                                                                                                                                                         |
| Disaster recovery                       | `docs/DISASTER-RECOVERY.md`                           | Before touching backups/migrations, and for the quarterly restore drill                                                                                                                                                      |
| Capacity / scaling                      | `docs/CAPACITY.md`                                    | When load or latency questions come up                                                                                                                                                                                       |
| Third-party dependencies                | `docs/DEPENDENCIES.md`                                | When an integration fails or a new one is added                                                                                                                                                                              |
| Architecture decision records           | `docs/adr/`                                           | Before revisiting an irreversible design choice                                                                                                                                                                              |
| Security policy                         | `SECURITY.md`                                         | For vuln reporting + the controls inventory                                                                                                                                                                                  |
| Contributing / PR bar                   | `CONTRIBUTING.md`                                     | The workflow + review checklist                                                                                                                                                                                              |
| New-dev onboarding                      | `docs/ONBOARDING.md`                                  | Day-1 path                                                                                                                                                                                                                   |
| Owner transcript distillation           | `docs/source-material/USER_SESSION_BUSINESS_LOGIC.md` | Before scoping any module work                                                                                                                                                                                               |
| Product thesis                          | `docs/PRODUCT-THESIS.md`                              | Before choosing product direction; field adoption, voice/photo entry, informal-process tolerance                                                                                                                             |
| Competitor gap analysis                 | `docs/competitor-map/14-gap-analysis-vs-nirman.md`    | When checking parity                                                                                                                                                                                                         |
| Competitor deep map                     | `PLATFORM_RESEARCH.md`                                | When designing a specific module's flows                                                                                                                                                                                     |
| Mobile UX research                      | `docs/MOBILE_FLOW_MAP_BRAINSTORM_V2.md`               | Before mobile UI work                                                                                                                                                                                                        |
| Mobile mega plan                        | `~/.devin/plans/plan-3b8e1996af9d6943.md`             | For Phase 2/3/4 task detail                                                                                                                                                                                                  |
| Testing findings                        | `TESTING_FINDINGS.md`                                 | Before verifying a module                                                                                                                                                                                                    |
| Wayfinder tickets                       | `.wayfinder/tickets/*.md`                             | For module verification checklists                                                                                                                                                                                           |
| Schema                                  | `packages/db/prisma/schema.prisma`                    | **Before assuming anything is a "gap"**                                                                                                                                                                                      |
| Team workflows & India business context | `docs/SRG_REALCON_TEAM_WORKFLOWS.md`                  | Before refining any role-specific page/button — maps all 7 seeded users to real-world daily workflows, cross-role handoff chains, and India-specific regulatory context (RERA, GST, TDS, land records, construction billing) |

---

## Authority model — the invariants (post multi-role hardening)

Three axes, one job each. Confusion historically came from conflating them:

| Axis                       | Lives on                                     | Governs                                                                                                                                         |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role tier** (1–5)        | `UserCompany.role/secondaryRoles/activeRole` | Authority — what you can DO (permissions, manage checks, role grants)                                                                           |
| **hierarchyLevel** (H1–H6) | `Employee`                                   | Org seniority — display, org chart. Only gate: the **H1 wall** (below top level, H1 dossiers invisible + immutable). H2–H6 carry NO manage gate |
| **Scope**                  | `UserCompany.scopeType` + `UserScope[]`      | Visibility — which rows exist for you at all                                                                                                    |

Supporting rules:

- **Worn hat grants power; held hats only protect the wearer as a target.** `getUserPermissions`/`getOwnRole`/`getActingRole` all resolve `activeRole ?? role`; dormant hats contribute nothing.
- **Department is a label** — `Employee.departmentId` grants nothing by itself; only `UserScope` DEPARTMENT entries narrow visibility.
- **Delegation** = permission UNION + acting-role min-tier (superset, temporary) — but scope stays the delegate's OWN (`getAssignedProjectIds` uses `getOwnRole`), and delegates must hold a tier ≤ 3 hat. `isTopLevelViewer` uses ownRole, so even a delegated OWNER can't see H1 dossiers.
- **reportsTo is one line, two views**: `Employee.reportsToEmployeeId` (org chart) ↔ `UserCompany.reportsToUserCompanyId` (approval chain) — synced on _change_ in both directions (`updateEmployee` ↔ `assignScopedMembership`), each with a cycle check on the receiving side.
- **Password reset is stricter than profile edit**: tier-1 targets (OWNER/ADMIN/DEVELOPER hats) can only be reset by the real OWNER (`getOwnRole` — delegation can't seize accounts).
- **scopeWhere is fail-closed**: every `companyId` model must be in `SCOPE_FIELDS` or `KNOWN_UNSCOPABLE`; the `scope-registry.test.ts` CI test enforces coverage. Employee-bearing models get the H1 subject wall via `EMPLOYEE_SUBJECT_RELATIONS`.
- **Notifications carry the wall too**: `resolveRecipients` drops below-top recipients for events about H1 subjects (leave, claims, payroll, contract milestones).
- **Employee rows are never returned raw** — `pickEmployeeRoster`/`redactEmployeeRow` or `select:`; enforced by `employee-serialization.test.ts`.
- **`/api/cron/integrity`** runs daily — flags level↔tier divergence, stale hats, reportsTo drift/cycles, orphan links, dead-account phone assignments to tier-1 members.

## 21. Demo-dataset seeding (non-destructive)

The dev DB was nearly empty — surfaces rendered honest empty states but couldn't be demoed end-to-end. Seeded a coherent running-company dataset **non-destructively via the real APIs** (not the `pnpm --filter @nirman/services seed` script — `wipeTransactional()` does a global `deleteMany` that would destroy existing records).

Seeded through live API calls (session = OWNER): 4 suppliers (cement/steel/aggregate/electrical), 2 stock locations (Central Store warehouse + Apex site store), 4 materials (+ the 2 existing), a full PO→approve→order→GRN chain (PO-20261009-0001), a stock issue to site (SA-261009-0001, ₹70,350 — MAC costing verified exact), 4 role-assigned tasks, 3 CRM leads, 4 vehicles, 2 subcontractors + issued work order WO-261009-0001, a BOQ line, and a completed+paid unit sale (SAL-20261009-0001).

Verified live: inventory surface shows ₹1.96L stock across 2 locations + reorder alerts; GL postings land (9 entries); live activity feed reflects every mutation; Collections view renders the sale.

**Note for re-seeding**: use `pnpm --filter @nirman/services seed` only for a fresh full-company reset — it wipes ALL transactional rows globally (no company filter).

## 22. Contractor-billing chain verified live

Exercised the full estimate→billing→payment loop with the seeded data: BOQ line → issued work order → MB entry (measure 4,000 cft → verify → approve) → RA bill (auto-submit → approve) → payment.

**Statutory math verified exact** on RA-261009-0001: gross ₹4,72,000 (4,000×₹118) − retention 5% (₹23,600) − TDS 2% (₹9,440) = **₹4,38,960 net**.

**Segregation of duties enforced**: the bill's creator got `403 — "You cannot pay an RA bill you created or submitted — ask another authorized user"`; a different authorized user (FINANCE_HEAD, holds `ra.pay`) paid successfully. The person who certifies measurement ≠ who releases money — correct anti-fraud control.

Every seeded transaction posted a correctly-classified journal entry — the GL audit trail is complete end-to-end (RA approval ₹4,72,000, material issue ₹70,350, goods receipt ₹3,03,550, sale ₹57,75,000 + deposits/payments).

## 23. Payroll verified live end-to-end

The demo now exercises the complete HR money loop: employee wage setup (monthlySalary per role) → `POST /api/payroll` generates a DRAFT period → each line pro-rates `monthlySalary/27 × daysWorked` (attendance-driven) → `process` → `pay` → GL posts.

**Findings:**

- **Data gap fixed**: employees had `monthlySalary: null` → payroll generated all-₹0 lines. Set realistic per-role salaries; regenerated with `confirm:true` (the draft-overwrite guard correctly required it).
- **SoD on self-edit**: the OWNER's own salary PATCH correctly returned 403 — can't self-modify a tier-1 record. A co-owner/admin sets owner pay.
- **Pay math verified**: e.g. ₹85,000/mo → ₹3,148.15 for 1 attendance day (÷27). Net total ₹14,074 for the month-to-date.
- The whole chain posts to GL like every other money event.

All modules now carry exercised, GL-posted data: procurement (PO→GRN→issue), contracts (BOQ→WO→MB→RA→paid), sales (book→collect→complete), HR (attendance→payroll→paid), tasks, leads, fleet.

## 24. Procure-to-pay accounting loop closed

Completed the full AP cycle on the seeded data: PO-20261009-0001 → GRN → `POST /api/supplier-invoices/from-grn` auto-generated the invoice **with a live three-way match** (`matchStatus: THREE_WAY_MATCH` — PO price = GRN received = invoice total ₹3,03,550 = ₹2,66,500 + ₹37,050 GST) → `POST /api/supplier-payments` (₹3,03,550, NEFT) → invoice **PAID**.

Every financial loop now exercises live end-to-end with correct amounts posted to GL:

- **Procure→pay**: PO → GRN → three-way-match invoice → payment → PAID
- **Estimate→billing→pay**: BOQ → WO → MB → RA → paid (SoD: submitter can't pay)
- **Sales**: unit → book → deposits → registry/BBA → complete → PAID
- **HR**: attendance → payroll (pro-rated by days worked) → paid

## 25. Inventory control loops verified live

Exercised the remaining inventory/financial operations on the seeded data:

- **Expense**: create DRAFT → submit → auto-approve (owner tier-1) → re-approve correctly 409s → GL `EXPENSE ₹2,400` posted.
- **Stock transfer**: Central Store → Apex site (200 agg + 150 sand). **Gate control enforced** — the transfer auto-created gate pass GP-261009-0001; dispatch returned `400 — items cannot leave the gate until approved` until the pass was approved, then dispatch→complete moved the stock. Ledger reconciles exactly.
- **Stock count/reconciliation**: counted cement 348 vs book 350 → variance −2 detected → confirm → reconcile → ledger adjusted to 348 → GL `STOCK_ADJUSTMENT ₹730` (2×₹365 shrinkage written off).
- **Payroll**: 7 employees, `salary/27 × daysWorked` pro-rating, DRAFT→PROCESSED→PAID, owner self-salary edit correctly 403s.
- **Supplier AP**: GRN → three-way-match invoice (PO=GRN=invoice ₹3,03,550) → payment → PAID.

Every inventory + money operation posts a correctly-classified journal entry. The demo is a complete running company.

## 25b. Supplier return + equipment verified live

- **Supplier return** RET-20261009-0001: created → auto-submitted → **gate-pass enforced** (`GP-261009-0002` blocked complete until approved — nothing leaves the site unapproved) → complete → cement 348→338, credit note CN-SCS-8821, GL `SUPPLIER_RETURN ₹4,307` (10×₹365×1.18 GST reversed correctly).
- **Equipment**: mixer/vibrator/scaffold added (assetTag+name+cost), mixer assigned to Apex site store (project+location scoped), scheduled maintenance logged. Same gate-pass control as transfers — consistent.

**Gate-pass is a uniform invariant**: any outbound material movement (issue-to-site transfer OR return-to-supplier) auto-creates a pass and blocks until approved. Correct site-security behavior.

## 26. Data-integrity controls verified live

Exercised the concurrency/replay guards with real requests:

- **Optimistic locking** (Material.version): write v=2 → 200 (bumps to 3), retry same v=2 → `409 CONCURRENT_EDIT` — "expected version 2, but current version is 3. Please reload and try again." Stale writes can't silently clobber newer data.
- **Idempotent mutations** (`X-Idempotency-Key`): two identical POST /api/tasks with the same key → both returned the same task id, no duplicate. The offline-replay safety a field user needs — a retried submit on flaky signal doesn't double-create.
- **E-invoice eligibility**: `POST /api/e-invoice/asset-sale/[id]` on a B2C sale correctly rejected `400 — both company and customer must have GSTIN (B2B only)` — IRN generation enforces the statutory rule.
- **Equipment**: assign + maintenance scoped to project/location.
- **Supplier return**: gate-pass enforced on outbound (same invariant as transfers), credit note + GL `SUPPLIER_RETURN ₹4,307` (GST reversed correctly).

## 26b. Material sale + COGS posting verified

Sold 20 cement bags @ ₹400 + 28% GST to a customer via `POST /api/material-sales` → MS-20261009-0001. Stock 338→318, revenue ₹10,240 posted AND `MATERIAL_SALE_COGS ₹7,300` (20×₹365 cost) — the ledger correctly recognizes revenue AND removes inventory at cost. Textbook double-entry for material sales (selling excess stock is a real construction-co revenue line).

## 26c. Scrap + equipment + material-sale verified

- **Scrap generation** SG-261009-0001: produced 45kg steel offcuts into the site store (rebar-cutting waste → `isScrap` material). Site waste → trackable scrap.
- **Equipment**: mixer/vibrator/scaffold with asset tags; mixer assigned to site store; scheduled maintenance logged.
- **Material sale** MS-20261009-0001: sold 20 bags @ ₹400+28% GST → revenue ₹10,240 + COGS ₹7,300 posted — correct double-entry.
- **Supplier return** RET-20261009-0001: gate-pass enforced, credit note + ₹4,307 GL.
- **Data-integrity**: optimistic lock (409 CONCURRENT_EDIT on stale write), idempotent POST (same X-Idempotency-Key → same record), e-invoice B2B guard.

## 27. Notification delivery + full-module coverage confirmed

- `NotificationLog` shows real delivery — `EQUIPMENT_ASSIGNED` and `GATE_PASS_APPROVED` fired to the right recipients (multi-user). Owner's own feed is correctly empty (he's the actor, not the recipient).
- **Full inventory lifecycle verified**: procure (PO→GRN→3-way-match invoice→payment→PAID) → issue to site → transfer (gate-pass) → count/reconcile (variance → GL adjust) → return to supplier (gate-pass, credit note, GST reversal) → sell excess (revenue + COGS) → scrap generation.
- Approvals queue honestly empty after processing — "Nothing to approve" renders correctly.

The demo is a complete running company with every module exercised and GL-posted.

## 28. Requisition→PO chain verified (site→procurement link)

`POST /api/requisitions` → REQ-20261009-0001 (auto-submit + auto-approve for owner) → `convert` blocked by a **3-quote gate** ("0/3 quotes uploaded — upload more or waive (requires approver)") → waived with a reason → convert created **PO-20261009-0002** linking back to the requisition.

Two real procurement controls confirmed: competitive-bidding quote gate, and every PO line requires a real unit cost (a ₹0 line rejected — `lineCosts` keyed by materialId). The site→procurement→receive chain is now fully exercised.

## 29. Change order + leave/payroll-lock verified

- **Change order** CO-261009-0001: ADDITION/client-request for a 2nd-floor powder room, +4-day schedule delta, cost lines (~₹59,800). Variation management works.
- **Payroll-lock integrity**: approving a leave after Oct payroll was PAID correctly refused — `400 — Attendance is locked — 10/2026 payroll is already paid. Correct it with an adjustment in the next period.` A settled payroll period can't be mutated retroactively; corrections go through the next period. Real payroll-integrity control surfaced by exercising it.

**Requisition→PO** (`#28`) + leave-lock round out the request/approval surfaces.

## 30. REAL BUG FIXED — WO signing advance over-recovery + more flows verified

**Bug (fixed)**: `createWorkOrder` seeded `advanceAmount` (the recoverable balance — "total advance paid" per the RA-recovery comment) from input **without posting the disbursement**. `payAdvance` adds to the balance AND posts `Dr ADVANCE_TO_SUB / Cr CASH`, but create-time advance never left the ledger. A WO created with a ₹1.5L signing advance showed it recoverable with no cash recorded → RA bills over-recovered ₹1.5L from the subcontractor. **Fix**: create posts the same advance GL entry when `advanceAmount > 0` (`subcontractor.ts`). Regression test added (`work-orders/route.test.ts`).

**Flows exercised live:**

- **Requisition→PO**: REQ→(3-quote gate)→waive→convert→PO — site→procurement link.
- **Leave**: approves on unlocked periods (Dec); correctly BLOCKED on a paid payroll period (Oct) — "correct with an adjustment in the next period."
- **Change order**: ADDITION/client-request with schedule+cost impact.
- **Delegation**: owner → PROJECT_DIRECTOR authority with expiry + note, verified active, revoked.
- **Supplier return / equipment / material sale / scrap / stock count** — all post correct GL entries.

## 31. DPR-finance reconciliation + remaining surfaces verified

- `GET /api/dprs/finance-reconciliation` reconciles field-reported DPR cost vs GL-posted project cost per DPR (variance + isPosted). The field-cost-vs-finance control works.
- No bank-statement reconciliation model exists — the app models cash/UPI/NEFT directly (field-first), so statement-import matching isn't a module; AP/AR flows reconcile via invoice↔payment matching instead.

**Every module now exercised live with real data** — procurement, inventory (issue/transfer/count/return/scrap/sale), contracting (BOQ→WO→MB→RA→pay + advance/retention), sales (book→collect→complete), HR (attendance→payroll→leave), fleet, equipment, CRM, notifications, approvals, delegation, change orders, print, reports, e-invoice.

## 32. Invariant sweep — financial, stock, concurrency, offline

Audited the "balance/amount field set without a backing journal" defect class
across all services after the WO-advance fix. **Everything else is consistent:**

- **Employee advances**: `issueEmployeeAdvance` posts `Dr ADVANCE_TO_EMP / Cr CASH` at issuance — the exact pattern the WO fix mirrors.
- **Petty cash**: create/top-up/spend each post `Dr PETTY_CASH / Cr CASH` (or expense).
- **Supplier balance**: `balanceOwed` increments on GRN (mirrors Cr AP), decrements on payment; payment void reverses the JE.
- **Retention release**: guarded (COMPLETED + defect-liability period elapsed or explicit override) + posts `Dr Retention Payable / Cr Cash`.
- **Double-entry controls**: RA bill `status !== "APPROVED"` blocks re-pay; supplier payment has a 15s identical-payment double-submit guard + over-payment caps vs PO/invoice totals; `raBillLineId:null` prevents double-billing an MB entry.
- **Stock**: issue guards negative stock; transfers record transit shortage as `ADJUSTMENT_OUT` at source (no phantom destination stock).
- **Concurrency**: optimistic lock (`409 CONCURRENT_EDIT` on stale version), `X-Idempotency-Key` dedupes retries, `NumberSequence` atomic upsert+increment in Serializable tx (per-company-per-day prefix).
- **Offline queue**: IndexedDB-backed, ops stamped with companyId+userId (never replay cross-account), FIFO sync on online/focus, dead-letter for permanent failures, `/m/queue` management UI renders.

**Net**: the WO-signing-advance gap was the sole defect in this class; the financial/stock/concurrency invariants are otherwise uniformly enforced.

## 33. Petty cash + employee advance + full requisition→PO→receive verified

- **Petty cash** (float ₹25,000): create → spend ₹450 (auto-creates an Expense) → top-up ₹10,000. Every step posts GL (`PETTY_CASH_CREATE/TOPUP/SPEND`). Current float ₹34,550.
- **Employee advance**: ₹15,000 issued to Yash (₹5,000/mo recovery, ACTIVE) → `EMPLOYEE_ADVANCE` GL posted (Dr receivable / Cr cash). Deducts from payroll until settled.
- **Requisition→PO→receive**: REQ → approve → 3-quote gate → convert → PO-20261009-0002 (DRAFT→approve→order→receive) → 15,000 bricks + 800kg rebar landed at site store. Full site→procure→stock chain.

The demo now exercises every cash/asset workflow including advances, petty cash, and requisition-driven procurement.

## 34. SECOND REAL BUG FIXED — supplier-return credit never settled the invoice

**Bug (fixed)**: A completed `SupplierReturn` reduced `supplier.balanceOwed` (the
aggregate) but `reconcileSupplierInvoiceStatuses` only counted payments against
`totalAmount`. An invoice with an associated return stayed APPROVED with a
phantom residual even though the supplier was net-settled — a field user saw
"₹4,307 unpaid" on a discharged bill. **Fix**: reconciliation now counts
COMPLETED return credits (grouped by `purchaseOrderId`) toward coverage, so
payments + credits ≥ total → PAID (`supplier-payment.ts`). Regression test added.
Verified live: invoice reached PAID after paying the net ₹2,99,243 (₹4,307 credit
applied). 32 supplier tests green.

**Also verified**: supplier-payment **void** → JE reversal + invoice re-opens
(PAID→APPROVED) + balance restored; requisition correctly marks CONVERTED with
`convertedPoId` link (terminal — can't re-convert); petty cash + employee
advance post GL at every step.

## 35. THIRD REAL BUG FIXED — auto-scrap never refreshed Material.currentCost

**Bug (fixed)**: `standard-consumption.ts` records `SCRAP_GENERATED` IN movements
(which update the location `movingAvgCost` inside `recordMovement`) but never
rolled the new MAC up to `Material.currentCost` — while the manual scrap path
(`scrap.ts:285`) does. A scrap material arriving only via DPR over-consumption
kept a stale `currentCost`, mis-valuing it in lists/reports. Now refreshes per
the manual path. (Verified the design is correct elsewhere: `currentCost` only
needs a refresh after IN movements — OUT keeps `newMAC = oldMAC`; every other
IN path refreshes.)

**Invariant sweep — cached aggregates**: `supplier.balanceOwed` (GRN/payment/
return/void all consistent), `wo.retentionBalance` (hold/release), petty cash
(create/topup/spend), `Project.totalProjectCost` (every cost-write calls
`reallocateProjectCosts`, plus a drift-detecting health check), AR (computed
per-sale from GL, not cached — no drift possible). The 3 fixes were the only
genuine stale-cache defects.

## 36. Cached-aggregate sweep COMPLETE — 3 genuine defects, everything else self-healing

- `PaymentScheduleItem.paidAmount` recomputes via `syncPaymentScheduleFromPayments` on every change (derived, not a drifting increment) — no stale-cache gap.
- `AssetSale` paid state derives from non-VOID `AssetSalePayment` rows — a void naturally un-counts.
- Confirmed MAC design is correct: `currentCost` only needs refresh after IN movements (`newMAC = oldMAC` on OUT); every IN path refreshes except the auto-scrap path now fixed.

**Full-session invariant-sweep result: 3 real bugs found + fixed** (WO signing advance GL, supplier-return credit→invoice, auto-scrap MAC rollup), every other cached aggregate/denormalized field verified consistent or self-healing.

## 37. WO-completion integrity — stranded receivable + stranded measured work

**Bug 4 (fixed)**: `completeWorkOrder` guarded pending RA bills but NOT an
unrecovered advance or approved-but-unbilled MB entries — both strand forever
once the WO closes (no RA bill can run after completion). Now:

- **Unrecovered advance** blocks completion unless `forgiveAdvance{reason}` —
  which posts `Dr Operating Expense / Cr Advance to Sub` + records
  `advanceWrittenOff` (new field; outstanding = paid − recovered − writtenOff).
  Mobile complete flow opens a write-off sheet when a balance remains.
- **Approved-unbilled MB entries** block completion (verified work never
  reaching a bill) — bill or reject them first.

Verified live: WO-0002 (₹3,00,000 advance, ₹55,200 recovered) blocked on
₹2,44,800 → wrote off → COMPLETED with JE `ADVANCE_WRITE_OFF`. Regression
tests: 4 pass. Other transitions (PO partial→PARTIAL-not-RECEIVED, sale
cancel guards, retention release, payroll lock) verified already correct.

## 38. Cross-surface parity + dead-button/route sweep — clean

- **Desktop WO complete** now opens an advance write-off dialog on unrecovered
  balance (mirrors the mobile sheet + retention-override pattern). Both
  surfaces handle the write-off consistently.
- **Dead buttons**: none — every rendered action wires to a real handler.
- **Missing routes**: none — every `/m/*` and desktop link resolves to a page.
- **Offline DPR**: the field's most-used screen queues the submission on
  no-signal and syncs later — correct field behavior.
- **Permission gating**: buttons render only for roles with the permission AND
  the right status; SoD is mirrored in visibility (creator never sees the pay
  button) — no click→403 dead ends.

**Session total: 5 real defects found + fixed** (WO advance GL, supplier-return
credit→invoice, auto-scrap MAC, stranded advance on WO complete, unbilled MB on
WO complete) + comprehensive verification across every invariant class, UI flow,
offline, permission, and route. 1,707 services tests green.

## 39. FULL SYSTEM AUDIT COMPLETE — production-ready, deploy blocked on network

**Final quality gates — all green**: typecheck (all 5 pkgs), lint, prod build
(488 routes), **4,233 tests** (1,707 services + 2,526 web), live browser
verification across every module.

**Session defect tally — 5 real bugs fixed**: WO signing advance never posted
GL (RA over-recovery), supplier-return credit not settling the invoice (phantom
unpaid), auto-scrap never refreshing Material.currentCost (stale valuation),
WO completion stranding unrecovered advance (added write-off path + GL), WO
completion stranding approved-unbilled MB entries (blocked). Plus desktop/
mobile write-off UI parity.

**Everything else verified already-correct**: all financial invariants,
terminal-transition guards, GL-posting completeness, void reversals,
concurrency (optimistic lock, idempotency, atomic sequence, conditional-decrement
negative-stock), soft-delete referential integrity, multi-tenant isolation,
rounding/paise handling, dead buttons, missing routes, offline DPR queue,
permission/SoD-in-UI, net-pay floor on advance recovery, voice-agent →
assistant pipeline, pluggable portal-listing providers.

**BLOCKED — live deploy**: the entire production host is unreachable from this
environment — `ssh nirman-vps` (port 22), `https://nirman.life`, and Coolify
`82.41.67.34:8000` all time out. This is a network/access constraint, not a code
gap. When a path to the VPS exists: `./scripts/deploy-prod.sh` ships all
commits, `./scripts/prod-health-check.sh` verifies live.

## 40. Interactive walkthrough — write-off sheet opened before earlier guards

Live browser verification caught a real interaction-ordering bug the static
audits missed: `MobileWorkOrderActions` opened the write-off sheet on
`advanceBalance > 0` immediately on tap — so a WO with a pending RA bill
asked the user to write off the advance, THEN errored on the bill. The user
was being asked to write off an advance that wasn't the real blocker.

Now `doAction("complete")` runs the API first and opens the sheet only on the
actual `unrecovered` error — pending bills / unbilled MB entries error first,
matching the service guard order and the desktop dialog. Verified live:
pending-bill WO errors correctly, write-off sheet appears only on the real
advance blocker. Created + exercised WO-261009-0003 end-to-end
(BOQ→WO→advance→issue→MB→RA→approve→complete) to prove the flow.

## 41. Three field-UX features from the owner walkthrough

(a) **DPR back-dated override** — the payroll-lock blocked ALL DPR filing into a
settled month, even when work was genuinely done but unfiled (site shut for
rain). Now an admin approver (DPR_APPROVE_ADMIN) sees an override-reason field

- "Submit with override" on a locked date; the DPR files flagged `backDated`,
  audited, and its labour surfaces as a next-period adjustment rather than
  rewriting the closed month. Field users still hit the lock.

(b) **Record Wastage on Site Stock** — a field worker seeing damaged/spoiled/
lost material (cement hardened by rain, cracked bricks) had to navigate to
material-detail → adjust 3 taps deep. Now a "Record Wastage" quick-action opens
a sheet: location → material → qty → damage reason → a GL-backed
ADJUSTMENT_OUT via the existing adjust-stock service (same ledger, scope-gated,
qty-validated against available).

(c) **Orbit explorer on project detail** — the designer OrbitNavigator (only on
home for the company) now opens from a project's hero button as a full-screen
overlay rooted at the project — built units, WOs, materials, expenses, phases
orbit as tappable chips. The orbit is already a generic entity explorer via
/api/orbit?type=&id=, so it's reusable for customer/equipment/PO detail too.

## 42. Site purchase — receiving material that arrived without a PO

Verified live that receiving hard-requires an APPROVED PO — a real gap: urgent/
cash buys at a gate can't be logged until the office raises one, so goods arrive

- get used + never enter stock. But the PO-approval is a deliberate control
  (storekeeper can't self-approve → phantom stock prevention). The fix isn't a
  bypass — it's post-hoc review via the **existing `direct-purchases` primitive**
  (`createDirectPurchase`): a storekeeper (INVENTORY_MANAGE) records the delivery,
  which creates a real DirectPurchase bill (free-text vendor name, no fabricated
  PO) + a PURCHASE_RECEIPT stock movement. Stock enters correctly; procurement
  sees the spend under the POs tab's "Cash purchases" section. (An earlier draft
  auto-created a flagged PO — corrected: that duplicated the existing
  `direct-purchases` subsystem.) Route POST /api/goods-receipts/quick (wraps
  `createDirectPurchase` — field-facing wrapper, PROCUREMENT perms map to it),
  page /m/site/receive/quick, a persistent "Site bought it — record a cash
  purchase" link on the receive screen (always visible, not just empty-state).
  Verified live: bill P-000001 landed in Cash purchases + stock posted to the
  site store.

## 43. Offline photos are retained + uploaded, not silently dropped

A photo taken while offline failed `/api/uploads` and was dropped — every
field-photo path (DPR site photos, proof-capture, receipts, inspections) lost
the evidence silently. Knowledge-graph scoping (21 `PhotoUploader` callers)
placed the fix in the shared uploader + offline queue, not per-form:

- `lib/offline/photo-store.ts` (IndexedDB `nirman-photos`) retains the File blob
  on offline upload-fail; the form shows a local `blob:` preview marked
  "offline" (CloudOff badge).
- `PhotoUploader` re-uploads pending photos on reconnect — peeks + deletes the
  blob only on a successful upload (a failed retry keeps it).
- The offline queue resolves `pendingPhotoIds` → real URLs before replaying an
  op (`resolvePendingPhotos` in `queue.ts`), so a DPR submitted offline posts
  working links, not dead `blob:` refs. DPR enqueue carries `pendingPhotoIds` +
  filters blob URLs out of `photoUrls`.

## 44. WCAG AA accessibility pass — contrast + labels fixed globally

Ran axe-core across the mobile field surfaces (the accessibility-auditor
persona's methodology) — fixed 19 violations, all surfaces now clean:

- **Contrast** (18 on one screen): muted-ink tokens `--color-ink-400 #645e52` /
  `--color-ink-500 #807868` sat at 2.4–3.9:1 on the dark surfaces (#16140f /
  #1f1c16) — below the 4.5:1 AA floor on real readable text (tab labels, filter
  chips, PO numbers, nav). Raised both to ≥4.5:1 on paper-2 (ink-400 ~5.5:1,
  ink-500 ~5.8:1, ink-600 lightened to match); flipped the unread badge to dark
  text on the light-blue info background. Propagates app-wide.
- **Labels** (3 critical): floating-`<label>` form primitives didn't associate
  with their controls. `FormField` (DPR/customer/sale) now injects
  `aria-label=<label>` into input/select/textarea children; the shared
  `UnderlineInput` + `SelectorModal` search inputs got `aria-label`.

**Security + perf verified** (security-architect persona): `/api/uploads` is
hardened (auth, company-scope, magic-byte verification, MIME allowlist, filename
sanitize + UUID, off-public storage, auth-gated serving, rate-limit, size cap);
IDOR prevented (every entity query is `companyId`+`scopeWhere`); no
`dangerouslySetInnerHTML` on user content; better-auth secure cookies. Mobile
pages are server-rendered (`Promise.all` data on the server, no client-fetch
waterfall) — the field hub loads its data SSR-side.

## 45. UX workflow-check — 6 personas converged, 1 real fix

Ran the ux-workflow-check skill's multi-persona first-person walkthrough until
convergence (2 consecutive zero-gap rounds). Personas: first-timer-rushed storekeeper
(site purchase), returning-offline engineer (queue), skeptical desktop admin
(direct-purchase ledger), interrupted-mid-form (DPR draft), return-after-failure
(queue retry), crew-supervisor "don't miss anyone" (bulk attendance).

**One real fix**: a pending offline photo's `blob:` preview dies on reload —
the draft restored `pendingId` but showed a broken img even though the blob
was still in IndexedDB. `PhotoUploader.resolvePending` now regenerates a fresh
preview URL from the stored blob on mount (even offline) before uploading on
reconnect.

**Verified solid for its persona**: site-purchase copy/validation; offline
queue pending/failed/completed badges + "Synced N items" toast + failed→reason+
retry+redo guidance + completed ops persist; DPR draft auto-save/restore/banner;
attendance mark-all + per-worker flips + inline day-worker ("theke-wala") add +
GPS + payroll-lock; direct purchases durable in the Cash-purchases ledger.

## Deferred decisions (Oct 2026 batch)

- **Intercompany settlement** — documentation-only for now. IC transfers post
  Dr 1950 / Cr 2050 in each company's books and the balances stay visible;
  the actual cash movement reconciles in bank statements like most SME
  groups do. Revisit a paired settle-doc across both ledgers only if IC
  volume gets heavy.
- **e-Invoice / IRN** — dormant until turnover crosses the ₹5cr mandatory
  line. The route exists (`/api/e-invoice/material-sale/[id]`) but is
  unverified against the real IRP; validate only when the business needs it.
- **Accounting-period lock** — not enforced. JEs can backdate into closed
  months; small-firm flexibility wins over Tally-style date locks for now.

## 46. Money-path hardening sweep (Oct 2026) — converged

The multi-session audit of every debit/credit path closed these real defects
(each verified against live HTTP + Postgres, all pushed to main):

| Defect                                                                                    | Fix                                                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Customer over-collection (paid + returned) had no settle path except cash-out             | `applySaleCredit` moves credit between a customer's sales — paired `CREDIT_APPLIED` rows, symmetric void + reversal                                                |
| Material-sale cheque bounced = still "paid" in the books                                  | PENDING→CLEARED/BOUNCED lifecycle, bounce posts reversal + reopens the receivable; BOUNCED excluded from all paid sums (incl. the NULL-chequeStatus semantics bug) |
| Supplier payments had no failed-inspection signal                                         | `failedInspectionLines` on supplier GET + warn-not-block on the payment dialog                                                                                     |
| Depreciation was write-only (`postDepreciation` never called)                             | `annualDepreciationRate` + monthly `runDepreciation` cron + form field                                                                                             |
| Statutory payables (PF/ESI/TDS/GST) accumulated forever                                   | `StatutoryPayment` + ITC-offset GST leg + TDS-refund kind + void path                                                                                              |
| Customer delete guard missed unpaid material sales                                        | guard covers PENDING/ACTIVE/PARTIALLY_RETURNED + unpaid receivables                                                                                                |
| Supplier-invoice void didn't exist                                                        | `voidSupplierInvoice` — reverses JE, unwinds balanceOwed, refuses once payments reference it                                                                       |
| Requisition was decorative — no qty cap, request path dropped the link entirely           | `qtyIssued` ceiling per line, consumed at request/issue, released on cancel, backfilled from history                                                               |
| Second invoice on a PO compared against the whole GRN → variance 0 → silent double-settle | variance baseline is the un-invoiced GRN remainder; duplicates land on PPV                                                                                         |
| GSTR-1 blind to zero-GST sales and returns                                                | outward = revenue-credit ∪ 2100-credit JEs; CNs key off the return JE                                                                                              |
| Negative stock guarded only at service layer                                              | `CHECK (qty >= 0)` on StockLocationItem — DB-level backstop                                                                                                        |
| Statutory void was unreachable                                                            | `/api/statutory-payments/[id]/void` + UI action                                                                                                                    |

**Verification state**: 390 live-chain assertions · 1,751 unit tests ·
7/8 book checks PASS + `account-signs` WARN listing dev-DB litter only
(verifier seeds bypassed issuance postings — documented, not production
data). A fresh prod DB reads zero.

**Deliberately not built** (business calls, not bugs): intercompany
settlement between two companies' books; inspection payment-hold (warn
only); period locks; multi-bank accounts (single Cash/Bank is the
simplification); e-invoice IRN until the ₹5cr line.

## 47. UI-sweep hardening (Oct 2026) — the wiring gaps

Browser-driven sweep surfaced the last invisible-link class:

| Finding                                                                   | Fix                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requisitionId` accepted by API but no issue dialog offered the link      | Requisition selector in BOTH issue dialogs (IssueFormDialog + IssueMaterialsDialog), filtered to the selected project/department, posts `requisitionId` so the qtyIssued ceiling actually binds |
| Indent detail showed requested qty but hid consumption                    | Issued column in requisition detail (warning while partial, success when fully drawn)                                                                                                           |
| Payroll accepted year 2079 — no year bound                                | `generatePayroll` refuses year <2000 or >current+1                                                                                                                                              |
| `/api/requisitions` omitted `departmentId` so dept issues couldn't filter | added to the GET serializer                                                                                                                                                                     |

Verified live in the browser: selector lists `REQ-CAP-AA — 50 units
approved`, indent detail shows `Issued: 49`, statutory void + supplier
invoice void buttons act, failed-inspection warning renders on supplier
payment, P&L/GL/customers/land/employees/approvals all render real data.

## 48. Frozen cost pools on halted/completed projects (Oct 2026)

`issueMaterialsToProject` refused ON_HOLD projects — but every other
cost entry point didn't: expense claims, manual project costs, work
orders, requisitions, and all three land-purchase entry functions could
attach cost to a project whose pool can never capitalize.

Now refused at intent time across `createExpenseClaim`,
`addProjectCost`, `createWorkOrder`, `createRequisition`,
`recordLandPurchase`, `recordLandPurchaseWithPlan` (per-section),
`recordLandPurchaseOrder`. Payroll labour still posts — attendance was
genuinely spent on that project; labour is a fact, not an intent.

## 49. Journal double-reversal guard (2026-10-16)

`reverseJournalEntry` had no protection against reversing the same JE twice
or reversing a `_REVERSAL` entry itself — a racing cancel or retry would
over-credit the books silently. `JournalEntryStatus.REVERSED` existed but
was never set, and setting it would break reports (`status:"POSTED"`
filters drop the original while its reversal stays POSTED → net −X instead
of 0).

Fix: `JournalEntry.reversalOfId` links the reversal to the exact entry —
doc-level `sourceId` can't dedupe because one doc carries several JEs
(revenue + COGS legs share it). Guards: refuse a second reversal (409),
refuse reversing a `_REVERSAL` (400), refuse non-POSTED originals. 113
historical reversals backfilled where the doc's JE set was unambiguous.
Regression test: `src/test/je-double-reversal.test.ts`.

## 50. Ceilings that silently floor instead of refusing

Two spots clamp instead of erroring — both deliberate:

- Transfer receive `qtyReceived = min(requested, dispatched)` — receiving
  more than sent silently records dispatched; the shortage posts to GL.
- Payroll deductions FIFO-clamp at gross — a deduction stack exceeding
  pay doesn't error, it just stops paying.

Both are "lenient physical/money flow" choices; the record keeps the truth
(shortage leg, unpaid-deduction remainder). No change needed, documented so
the next audit doesn't re-flag.

## 51. Lightly-probed service sweep — change orders, e-invoice, SMS, gate pass, direct purchase (2026-10-16)

Second hardening pass over service modules the first sweep only skimmed.
Same method: check every state transition, accumulator, and money write
for the invariants the rest of the codebase enforces.

**Change orders** — implementing rewrites BOQ lines and moves
`Project.totalBudget`, but COs weren't on the §48 frozen-pool list:
a COMPLETED/ON_HOLD project could still have its books rewritten.
Refused at create AND implement. Two deeper bugs: a linked `boqItemId`
deleted between approval and implementation was silently skipped —
the order marked IMPLEMENTED with the approved change only partially
applied while the budget moved the full delta — and the budget moved
by the CO's snapshot `costDelta`, which goes stale when a sequential
CO lands on the same BOQ item first. Implementation now refuses a
missing linked item (cancel + re-issue) and moves the budget by the
_applied_ delta recomputed from current `estimatedAmount` at write
time. Lifecycle exits fixed too: APPROVED is now cancellable
(best-effort auto-implement can fail, leaving an un-exitable stuck
record), re-cancel of CANCELLED refused, and delete refuses
SUBMITTED/APPROVED (in-flight records are immutable — cancel first).

**e-Invoice** — void sales could register an IRN: CANCELLED/RETURNED
material sales and CANCELLED asset sales (status or saleStage) now
refuse — an IRN on a void sale reports phantom revenue in GSTR-1.
PARTIALLY_RETURNED refused too (full-value IRN overstates; correct
trail is original IRN + credit note). `GENERATING`/`CANCELLING` claims
carry a 15-min stale window — a process crash between claim and portal
result write previously bricked the invoice's IRN path forever.

**SMS parser** — three money-path bugs. (1) Dedup claimed the smsHash
_after_ matchPayment's payment+GL commit — concurrent duplicate SMS
double-posted money; the hash is now claimed first (P2002 → duplicate).
(2) `detectTxnType` matched "credit" before "debited" — a "Credit Card
ending 4521 debited" alert classified as money received and could
auto-post; DEBIT now wins. (3) Tenancy and material-sale matchers
returned on the _first_ rent/outstanding match — two equal rents or
equal outstanding balances credited an arbitrary record; they now use
the same unique-match rule asset sales already had. Paid sums count
realised money only (`sumClearedAssetSalePayments`; VOID/OUT/BOUNCED
excluded on material sales). `manualMatchSms` claim + entity checks +
payment + GL + status write are now one serializable tx, and it refuses
CANCELLED sales, fully-PAID sales (customer-credit path is the recovery),
and non-ACTIVE tenancies.

**Gate pass** — line qty must be > 0 on both create paths; approver
refused when they are also the _submitter_ (the creator check missed
the maker-checker break); `projectId` is company-validated like
`locationId` already was.

**Clean on inspection**: `auto-requisition.ts` (dedup + advisory-only
DRAFT + project-status guard all present), `direct-purchase.ts`
(atomic conditional-decrement stock reversal, JE reversal via
`reverseJournalEntry`, symmetric `balanceOwed`), `vehicle.ts` (plain
ledger; route double-scopes trips).

## 52. Service sweep round 2 — valuation coherence, deposits, invoice voids (2026-10-16)

Third pass over the service layer, focusing this time on cached-balance
coherence (fields that must stay in lockstep with the GL) and
accumulator/lifecycle edge cases.

**Supplier return** — the qty cap against received PO quantities existed,
but `unitCost` was caller-supplied with no ceiling: a return claiming
₹5,000/unit on goods billed at ₹500 minted a fake AP credit absorbed
silently into PPV. Return unitCost now caps at the PO line's ex-GST
`unitCost` (not `unitLandedCost` — that includes GST + landed costs while
the return line is ex-GST). Supplier + location are company-validated.

**Stock count** — count lines accepted any materialId: a foreign tenant's
material could be counted and reconciled into our stock ledger. Every
line's material must belong to the location's company. Empty counts and
negative counted quantities refused.

**Scrap + employee advance** — scrap generation now refuses ON_HOLD/
COMPLETED projects (§48 frozen cost pools — a late WIP credit on closed
books). Advance recovery caps each payroll deduction at the remaining
outstanding — two PAID runs could push recoveredAmount above amount and
drive ADVANCE_TO_EMP negative.

**NRV write-down/recovery (the big divergence)** — `nrvWriteDown` fields
and the impairment ledger had drifted apart four ways: (1) the alerts
sweep never read the existing field for parcels and re-posted the FULL
write-down every run; (2) recovery cleared the field without a reversing
JE, so the ledger kept a loss the field said was 0 (and the next
write-down re-posted in full); (3) `updateParcelValuation` partial
recoveries posted nothing; (4) `unpartitionLandParcel` soft-deleted
impaired children while their write-down JEs stayed POSTED and the
restored parent carried full cost — LAND_ASSET permanently understated.
New `postNrvRecovery` (Dr asset / Cr OPEX) + delta semantics everywhere:
impairment posts the increase, recovery posts the decrease, sweeps only
post deltas, unpartition reverses child entries first. Status checks
moved inside serializable txs (TOCTOU — a concurrent sale could flip
the parcel SOLD between pre-check and write). Verified live end-to-end:
valuation 60k on a 100k parcel → 40k write-down JE; back to 100k → 40k
recovery JE, field 0.

**Subcontractor RA bills** — `otherDeductions` accepted negatives (a
negative deduction is a hidden addition → netPayable > billed gross) and
totals > gross produced a negative payable the pay path then refused,
leaving a stuck APPROVED bill. Both refused at create; a fully-deducted
zero-payable bill now marks PAID cleanly instead of staying stuck.

**Expense** — negative subtotal/GST/TDS and TDS > amount refused at
create and update: postExpense computes the credit leg as amount − TDS,
so TDS > amount produced a negative credit.

**Equipment** — recordMaintenance refuses negative cost (a negative
maintenance JE is phantom income); retireEquipment refuses with open
maintenance (the record could never complete and un-retire refused it —
a permanently stuck state).

**reallocateProjectCosts** — counted `materialIssueLine`s with no issue
status: a CANCELLED issue's lines kept their executed unitCost and kept
inflating projectMaterials/direct unit costs even though the cancel
path restores stock and reverses the JE — the cached cost diverged from
the GL after every cancel. Same for cancelled scrap generations
subtracting a recovery the books no longer hold. Both now count only
COMPLETED docs. Verified live: cancelling a unit-linked issue dropped
the direct-cost bucket by exactly its 482.80.

**Land cost components** — schedule reductions reversed whole JEs
newest-first and overshot whenever the boundary entry exceeded the
remaining reduction (GL posted below postedAmount permanently); now one
exact correction JE. Parcel repricing distributes new cost by each
leaf's EXISTING cost share — flat area pro-rata silently destroyed
MARKET_VALUE partition weightings — and excludes SOLD children
(repricing a sold parcel corrupts the COGS basis already booked).
Delete skips already-reversed JEs instead of 409ing.

**Supplier invoice void** — the AP unwind re-ran approve-time variance
math, but the un-invoiced-remainder baseline shifts as other invoices
approve, so void could unwind a different amount than approval posted
and drift `Supplier.balanceOwed` from the GL. Now derives the signed
impact (credit − debit) from the AP leg of the JE actually being
reversed.

**Tenancy deposits** — `activateTenancy` accepted ACTIVE→ACTIVE and
re-posted the deposit JE: double Dr Cash / double Security Deposits
Payable for one physical deposit (verified live — re-activation now
posts nothing). `changeTenant` refunded the deposit only for ACTIVE
tenancies; EXPIRED leases were ACTIVE once and still hold the payable —
they now refund too. newMonthlyRent/newSecurityDeposit get sign guards.

**DPR auto-scrap** — `runDprVarianceAnalysis` wasn't idempotent: a re-run
on a DPR that already generated scrap minted a second ScrapGeneration
(double stock-in + double WIP credit). Returns the existing generation
now. `scrapValuationPct` capped at 100 (scrap can't be worth more than
the material it came from); benchmark materialIds are company-checked.

**CRM payment schedule** — `recordSchedulePayment` refused nothing on
state: payments could land on CANCELLED sales or PAID/WAIVED
installments (a waived amount is deliberately forgiven — paying it
books phantom revenue). Both refused.

**Portal listing** — `updatePortalListing` got the LISTED guard
`deletePortalListing` already had (route pre-check raced a concurrent
sync). `/api/land-parcels/[id]` PATCH got the company+scope lookup GET
and DELETE already had — hold/release/valuate dispatched on bare ids.

**Clean on inspection**: quality-control (tenant seals + anchor
validation + placeholder-CAPA start block), moving-average-cost +
uom-conversion (pure math, guarded), recurring-expense (bounded
catch-up, serialization-safe nextRunDate), employee-dossier
(company-scoped components + amount bounds), leave (self-approval /
overlap / balance / payroll-locked-day guards), task, safety,
legal-docs, scheduling, stock-adjustment (the sanctioned manual
correction path — all invariants inside the tx), supplier-invoice
approve (remainder baseline), recordRentPayment/voidRentPayment/
applyRentEscalation/generateRentSchedule.
