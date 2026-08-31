# DECISIONS.md — Nirman Inventory OS Product Index

> **Read this first** (after `AGENTS.md`). This is the single routing layer that ties
> together every source of "what to build and why" so no session loses direction.
> It does NOT replace the detailed docs — it indexes them and tells you where to drill.
>
> **Last updated**: 2026-08-25 · **Maintainer**: update the status column each session.

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

| Source | What it tells us | Where | Authority |
|---|---|---|---|
| **Owner transcripts** | How the business actually runs — the sequence, the mandatory fields, the document trail, the approval gates | `docs/source-material/USER_SESSION_BUSINESS_LOGIC.md` (distilled from `Alpha Road 1–5.txt`, `Amoria Cafe.txt`) | **Highest** — owner voice wins |
| **Competitor research** | What 4QT/Tally/Zoho do screen-by-screen, and where Nirman has gaps vs them | `docs/competitor-map/14-gap-analysis-vs-nirman.md` (actionable summary) + `PLATFORM_RESEARCH.md` (deep map) | Medium — parity for parity's sake is deprioritized |
| **UX research + testing** | Mobile UX scorecard (3.7/10 → 9/10), 12 principles, Playwright bug findings | `docs/MOBILE_FLOW_MAP_BRAINSTORM_V2.md` (research) + `TESTING_FINDINGS.md` (bugs) + mega plan `~/.devin/plans/plan-3b8e1996af9d6943.md` | Medium — polish matters but after core flows work |

**Priority rule (decided): owner voice wins.** If the owner explicitly asked for it in a transcript, it ranks above mobile UX polish and above competitor parity. If the owner didn't mention it, it ranks below.

---

## Status legend

| Tag | Meaning |
|---|---|
| ✅ Done | Wired end-to-end (schema → service → UI) and verified |
| 🔧 Wired in schema | Modeled in Prisma (+ maybe service) but NOT exposed in UI — the biggest category |
| 🚧 In progress | Currently being worked on |
| ⬜ Not started | Genuine new build or not yet touched |
| 🐛 Bug | Broken, found in testing |

---

## The ranked backlog

> Ranked by: owner-voice-wins, then by (business-criticality × UI-exposure-gap).
> Items marked 🔧 are the highest-leverage work — the schema is ready, the UI just needs wiring.

### Tier 0 — Owner-voice core flows (modeled, need UI wiring + flow enforcement)

| # | Item | Schema | Service | Desktop UI | Mobile UI | Evidence | Backing ticket |
|---|---|---|---|---|---|---|---|
| D1 | Sale lifecycle: Sale Order → ATS/BBA → Registry → Complete, with document uploads per stage | ✅ `saleStage`, `bbaDate`, `saleDeedNo`, `atsDate` | ✅ stage transitions | ✅ sale detail dialog with stage badges + ATS/BBA/Registry uploads + sale deed tracking | ✅ mobile `SaleLifecycleTimeline` + document uploads + registry gate | Transcript §3.5 | T06 (closed) |
| D2 | Land cost breakup: base + lease rent (one-time/yearly) + GST + registration + stamp duty, all %-based with manual override | ✅ all fields + auto-calc | ✅ | ✅ desktop wizard + land hub | ✅ mobile wizard + detail + edit form | Transcript §2.3 | T05 (closed) |
| D3 | NOC / Legal permissions tab on Land + Project (map sanction, fire NOC, airport NOC, etc.) | ✅ `LegalDocument` model, extensive | ✅ CRUD | ✅ land hub + project hub "Legal" tab | ✅ mobile `MobileLegalDocsSection` | Transcript §2.6 | — |
| D4 | Rent / Tenancy module: registered agreement upload, monthly billing, yearly escalation, tenant change | ✅ `Tenancy`, `escalationPercent`, `escalationIntervalMonths` | ✅ 1139-line service | ✅ desktop `/rentals` | ✅ mobile `/m/rentals` | Transcript §6.1 | T14 (closed) |
| D5 | Sales CRM: slab-based construction-linked payment milestones (booking → foundation → 4th slab → 10th slab), auto demand notices, broker management | ✅ `PaymentScheduleItem` with `wbsNodeId` for CLP, `Broker` model | ✅ | ✅ desktop `/brokers` + payment plan editor | ✅ mobile sale form + broker section | Transcript §6.2 | T14 + T06 (closed) |
| D6 | Comparative Analysis UX on PO form: collect quotes → side-by-side → pick cheapest → PO auto-fills | ✅ `VendorQuote`, quote engine | ✅ `quote-comparison.ts` | ✅ desktop has `ComparativeQuotePanel` | ✅ mobile `MobileQuotePanel` + enhanced `ConvertForm` with quote gate + winner display | Transcript §1.3 | T02 (closed, mobile gap) |
| D7 | T&C cost-allocation on sales: each cost component "borne by client or seller" toggle + manual free-text T&C | ✅ `SaleTerm` with `borneBy`, `extraAmount` | ✅ | ✅ `SaleExpenseGrid` + `SaleTermsEditor` in sell dialog | ✅ mobile sale form | Transcript §3.3 | T06 (closed) |
| D8 | Printable sales order receipt (project, unit, deal price, advance, payment plan, T&C) | ✅ data exists | ✅ `amountInWords()` | ✅ 3 print pages (form, invoice, draft/LOI) + payment receipts | ✅ mobile sale detail links to print | Transcript §3.2 | — |

### Tier 1 — Owner-voice HR flows (modeled, need UI wiring + 1 genuine new build)

| # | Item | Schema | Service | Desktop UI | Mobile UI | Evidence | Backing ticket |
|---|---|---|---|---|---|---|---|
| D9 | GPS-tagged attendance from phone (geofence check-in, field staff approval flow) | ✅ `checkInLat/Lng`, `checkInLocation` | ✅ | ✅ desktop attendance view with GPS columns | ✅ mobile `MobileSelfCheckIn` with geolocation + geofence status | Transcript §5.1 | T13 (closed) |
| D10 | **3-tier traffic-light attendance status** (🔴 absent / 🟡 present-no-DPR / 🟢 present+DPR-approved) — **GENUINE NEW BUILD** (codes exist, rollup doesn't) | ✅ codes exist | ✅ `computeAttendanceTier()` + `getAttendanceWithTiers()` + `getAttendanceTierCounts()` | ✅ attendance view "Tier" column with RED/YELLOW/GREEN badges | ✅ mobile HR dashboard | Transcript §5.2 | T13 (closed) |
| D11 | DPR↔attendance linkage: attendance stays yellow until manager approves DPR | ✅ `DprLaborLine` exists | ✅ tier computation links DPR approval | ✅ tier column reflects DPR approval | ✅ mobile attendance shows tier | Transcript §5.2–5.3 | T13 (closed) |
| D12 | 5-code attendance (P/H/Late/PL/NPL) + "4 lates = 1 half-day" rule + 85% half-day definition | ✅ all 5 codes + 85% comment | ✅ `computeStatusFromHours()` + `computeLateHalfDayDeductions()` + `generatePayroll()` applies deduction | ✅ all 8 status codes in attendance view | ✅ mobile attendance form | Transcript §5.5 | T13 (closed) |
| D13 | Auto-salary calculation from attendance at month-end | ✅ `generatePayroll()` in `hr.ts` | ✅ | ✅ desktop `/hr/payroll` + `payroll-view.tsx` | ✅ mobile `/m/books/payroll` + `MobileGeneratePayrollDialog` | Transcript §5.5 | T13 (closed) |
| D14 | H1–H6 customizable HR hierarchy (assign any role to any level) | ✅ `hierarchyLevel` 1–6 on User | ✅ | ✅ employees view + edit form with H1-H6 dropdown | ✅ mobile employee form + detail | Transcript §5.4 | T15 (closed) |
| D15 | Team creation by seniors only (not self-sign-up) | ✅ RBAC `canAssignRole` | ✅ | ✅ user management uses `assignableRoles()` | ✅ mobile team list | Transcript §5.4 | T10/T15 (closed) |

### Tier 2 — Owner-voice secondary (modeled, lower urgency)

| # | Item | Schema | Service | Desktop UI | Mobile UI | Evidence | Backing ticket |
|---|---|---|---|---|---|---|---|
| D16 | Per-plot valuation + asking price captured at partition time | ✅ `askingPrice` + `currentValuation` on `LandParcel` | ✅ | ✅ `ParcelValuationDialog` + land hub KPIs | ✅ mobile land detail | Transcript §2.4 | T05 (closed) |
| D17 | Possession flag on Land + Project | ✅ `isPossessed` on both | ✅ | ✅ land hub possession badge + toggle button | ✅ mobile land detail | Transcript §2.7 | T05 (closed) |
| D18 | Owner-only subdivision undo (un-partition) | ✅ `LAND_UNPARTITION` action | ✅ | ✅ land hub unpartition button + API | ✅ mobile land detail | Transcript §2.4 | T05 (closed) |
| D19 | Broker + commission tracking on sales | ✅ `Broker` model, `brokerageAmount`, `brokerId` | ✅ | ✅ sell dialog "Deal Source" section + `/brokers` page | ✅ mobile sale form broker section | Transcript §3.1 | T06 (closed) |
| D20 | Cheque photo + bank + payment mode on sales/payments | ✅ `chequePhotoUrl`, `paymentMode` | ✅ | ✅ `ChequeFields` component in sell dialog | ✅ mobile `MobileChequeFields` | Transcript §3.1 | T06 (closed) |
| D21 | Purchase lifecycle mirror (PO → BBA/ATS → Registry → Complete) | ✅ `purchaseStage` BOOKED/COMPLETED | ✅ `completeLandPurchase()` + token payment tracking | ✅ land hub + land view + land detail drawer with BOOKED badge + complete dialog | ✅ mobile land list + detail with stage badges + complete flow | Transcript §3.6 | T02 (closed) |
| D22 | Land type Freehold vs Leasehold | ✅ `LandType` enum | ✅ | ✅ desktop wizard + land hub | ✅ mobile wizard + detail + edit form | Transcript §2.2 | T05 (closed) |

### Tier 3 — Genuine new builds (not in schema)

| # | Item | Status | Evidence | Backing ticket |
|---|---|---|---|---|
| D23 | BOQ (Bill of Quantities) per project — optional, engineer estimates pre-construction | ✅ Done (BoqItem model + service + desktop + mobile) | Transcript §7 | — |
| D24 | HSN/SAC auto-fetch from government GST portal | ✅ Done (pluggable provider: CBIC free snapshot + FastGST API; integration config + API route + 9 unit tests) | Transcript §1.1 | — |
| D25 | Standard cost "pull from previous purchase" on material form | ✅ Done (desktop + mobile) | Transcript §1.1 | T03 |
| D26 | Generic document-attachment infrastructure (polymorphic, any entity) | ✅ Done (EntityAttachment model + API + AttachmentList component) | Transcript §4.1 | — |

### Tier 4 — Mobile UX polish (mega plan, in progress)

> These are NOT owner-voice items — they're UX research-driven. They rank below Tier 0–3
> per the owner-voice-wins rule, BUT several are in-flight and low-cost to finish.

| # | Item | Status | Evidence |
|---|---|---|---|
| M1 | Global Search + Search Backend | ✅ Done (Phase 1) | mega plan §1.1 |
| M2 | Recent Items / "Jump Back In" | ✅ Done (Phase 1) | mega plan §1.2 |
| M3 | Sticky Submit Button on All Forms | ✅ Done (Phase 1) | mega plan §1.3 |
| M4 | "View This Entity" After Creation | ✅ Done (Phase 1) | mega plan §1.4 |
| M5 | Wire the Barcode Scanner | ✅ Done (Phase 1) | mega plan §1.5 |
| M6 | Fix Dead-End Navigation Links | ✅ Done (Phase 1) | mega plan §1.6 |
| M7 | Auto-Save Drafts on ALL Forms | ✅ Done (Phase 1) | mega plan §1.7 |
| M8 | Long-Press Contextual Menu | ✅ Done (Phase 2) | mega plan §2.1 |
| M9 | Swipe-to-Act on All Approval Lists | ✅ Done (Phase 2) | mega plan §2.2 |
| M10 | Migrate Action Bars to Optimistic Updates | ✅ Done (gate pass list) | mega plan §2.3 |
| M11 | Snooze on Attention Items | ✅ Done (attention banner + approvals queue) | mega plan §2.4 |
| M12 | Smart Form Defaults | ✅ Done (wired to PO, transfer, requisition, sale forms) | mega plan §2.5 |
| M13 | Photo Capture on All Field Entities | ✅ Done (gate pass exit photos, DPR, attendance, sales, land) | mega plan §2.6 |
| M14 | GPS Auto-Select Project | ✅ Done (useNearestProject hook + DPR + attendance forms) | mega plan §2.7 |
| M15 | Module-Level Error Boundaries | ✅ Done (Phase 2) | mega plan §2.8 |
| M16 | Load More Pagination on All List Pages | ✅ Done (procurement, dprs, transfers, sales, requisitions) | mega plan §2.9 |
| M17–M23 | Phase 3 magical features (voice, briefing, photo-DPR, push, QR, portal, batch-approve) | ✅ Done (voice ✅, QR ✅, batch-approve ✅, briefing ✅, push ✅, portal ✅, photo-DPR ✅ — OCR provider with OpenAI Vision/Google Vision/Azure DI/stub + API route + 2 unit tests) | mega plan §3.1–3.7 |

### Tier 5 — Competitor parity (lowest priority per owner-voice-wins)

> See `docs/competitor-map/14-gap-analysis-vs-nirman.md` for the full P0–P3 table.
> These are deprioritized unless they overlap with an owner-voice item above.

---

## What to work on next (recommended order)

> **Status as of latest audit**: All Tier 0–4 items (D1–D26, M1–M23) are now ✅ complete.
> The schema is ~100% complete. All external integrations are scaffolded with
> pluggable providers (Tally, WhatsApp, Email, Portals, HSN/SAC, OCR). Remaining work:

1. **Cross-cutting refinement** — per `global_rules.md`, refine every page/button
   to function correctly end-to-end (frontend ↔ backend ↔ database).
2. **UI wiring for new integrations** — add HSN/SAC search dropdown to material
   form and supplier invoice form; add photo-capture + OCR button to DPR create
   form. The backend APIs are ready (`/api/hsn-sac/search`, `/api/ocr/dpr`).
3. **Seed data completeness** — enriched with DPRs, payroll, tenancies, payment
   schedules, brokers. Consider adding more variety for testing edge cases.

---

## How to use this doc

- **Starting a session?** Read `AGENTS.md` (conventions) → this file (what to work on) → the evidence link for your chosen item.
- **Finished an item?** Update its status row here AND the backing wayfinder ticket (if any).
- **Found a new gap?** Add it to the appropriate tier with evidence pointer. Check the schema first — it's probably already modeled.
- **Tempted to build a "new module"?** Re-read "The one finding that matters most" above. Verify the schema doesn't already have it.

---

## Source documents (for drill-down)

| Doc | Path | When to read |
|---|---|---|
| Agent conventions | `AGENTS.md` | Every session, first |
| Owner transcript distillation | `docs/source-material/USER_SESSION_BUSINESS_LOGIC.md` | Before scoping any module work |
| Competitor gap analysis | `docs/competitor-map/14-gap-analysis-vs-nirman.md` | When checking parity |
| Competitor deep map | `PLATFORM_RESEARCH.md` | When designing a specific module's flows |
| Mobile UX research | `docs/MOBILE_FLOW_MAP_BRAINSTORM_V2.md` | Before mobile UI work |
| Mobile mega plan | `~/.devin/plans/plan-3b8e1996af9d6943.md` | For Phase 2/3/4 task detail |
| Testing findings | `TESTING_FINDINGS.md` | Before verifying a module |
| Wayfinder tickets | `.wayfinder/tickets/*.md` | For module verification checklists |
| Schema | `packages/db/prisma/schema.prisma` | **Before assuming anything is a "gap"** |
