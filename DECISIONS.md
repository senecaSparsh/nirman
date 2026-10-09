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
     delegates inherit the delegator's permissions (getUserPermissions union)
     and acting role (getActingRole) across all approval routes. Daily
     `/api/cron/approval-aging` (scheduled via scheduler.sh)
     digests stalled approvals to execs + active delegates — threshold is
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
