# Hands-On Product Audit — 12 Oct 2026

**Method:** Used the app like a real Indian construction/real-estate business for a full
working session — drove every workflow through the actual UI in a Playwright-controlled
browser (no API/DB scripting). Mutations listed below were all performed through the UI.

**Environment:** Local dev (`pnpm dev`, port 3000), PostgreSQL seeded `nirman_inventory`,
authenticated as **Vardaan Kumar (OWNER)** of SRG REALCON. Desktop 1440×900 + mobile
390×844 viewports, dark + light themes. A stale second dev server was running on :3100.

---

## 1. Workflows exercised end-to-end (all passed)

| #   | Workflow                                                                                                                                                                                                                                                                                                                                                                                                             | Result                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | **Approvals** — expand line detail (stock + last rate), approve indent individually, "Approve All" batch with confirm dialog, approve expense                                                                                                                                                                                                                                                                        | ✅ Toasts, list refresh, confirm dialogs all correct           |
| 2   | **Procure-to-pay (full chain)** — REQ-20261011-0006 → approve → waive 3-quote requirement (reason captured in activity log) → convert to PO (supplier, scope, destination store, expected date, GST breakdown) → **PO-20261012-0001** created → Approve & Order → GRN "Receive all remaining" → status Received → **Supplier payment SP-261012-0001** (UPI, ref no, TDS sections 194C/194I/194J/194Q/194H available) | ✅ Complete lifecycle works; payment shows "Paid ₹354/₹354"    |
| 3   | **Stock verification** — GRN posted movement "Receipt Apex Center Site Store +3kg" with correct running balance (6→9kg)                                                                                                                                                                                                                                                                                              | ✅ Inventory ledger accurate                                   |
| 4   | **Sales CRM** — created lead "Rajesh Sharma" (Hot, walk-in, owner assigned, budget range); Bookings board (BBA pending/done, revenue ₹4.05Cr, collected vs outstanding); Sale drawer — Record Deposit (deposit-as-liability, revenue not recognised), TDS ₹50K auto on ₹50L sale, ATS/BBA/Registry upload slots, Print Invoice/Form/LOI/Allotment Letter, **Generate IRN** (e-invoice), customer portal link         | ✅ Deep India-real-estate coverage                             |
| 5   | **HR** — dashboard (headcount 7, trade split, action queue, org chart w/ call links); attendance grid (P/A/H/OT/L/LT/NPL codes) + Mark All Present + Save; payroll **Generate Nov-2026 → Draft → Process** with PF / Er-PF / ESI / Prof-Tax / advance-deduction columns                                                                                                                                              | ✅ Payroll lifecycle works (see finding F1 for the lock issue) |
| 6   | **Finance** — recorded expense "Fuel & Diesel ₹8K CASH" (GST split CGST/SGST/IGST, TDS, receipt upload, draft vs submit-for-approval) → Pending; GL trial balance **balanced ₹4.69Cr = ₹4.69Cr** with abnormal-balance flags; Tally two-way sync queue (73 synced, 6 pending)                                                                                                                                        | ✅ Real double-entry accounting                                |
| 7   | **Materials master** — fixed TMT Rebar category (was Electrical/Adhesives → Steel & Rebar) via inline row combobox                                                                                                                                                                                                                                                                                                   | ✅ Inline editing persists                                     |
| 8   | **Mobile field ops** — orbit navigator home, briefing card; **received PO-20261010-0004** on /m/site/field (gate entry no, challan no, qty, review → confirm → "GRN recorded — stock updated", went through **offline Sync Queue**); created gate pass **GP-261012-0001** (vehicle UP32 XY 4567, driver, transporter, items, submit-for-approval toggle)                                                             | ✅ Site-engineer flows genuinely field-ready                   |
| 9   | **Notifications** — real-time feed (my GRN appeared "1 min ago"), deep-links to /m/* routes, mark-read/all, data-quality alerts ("Payroll Zero Gross — no daily rate set for Vardaan")                                                                                                                                                                                                                               | ✅                                                             |
| 10  | **Search** — ⌘K focuses "Search or jump to…", Enter jumps to best-match page (cement → /materials)                                                                                                                                                                                                                                                                                                                   | ✅ Works (see F8 for UX gap)                                   |
| 11  | **Theme toggle** — dark→light both render cleanly                                                                                                                                                                                                                                                                                                                                                                    | ✅                                                             |

**Mutations performed:** 2 indents approved + 1 batch-approved, 1 expense approved,
quote waiver on REQ-…-0006, PO-20261012-0001 created/approved/received + GRN,
payment SP-261012-0001 (₹354 UPI), lead "Rajesh Sharma", expense "Fuel & Diesel ₹8K",
Nov-2026 payroll generated + processed, TMT-12MM recategorized, mobile GRN vs
PO-20261010-0004 (5kg + GE-2026-101), gate pass GP-261012-0001, several notifications read.

---

## 2. Findings (bugs / refinements needed)

### P1 — Blocking / high-impact

**F1. Mid-month payroll payment freezes all site ops for the rest of the month**

- Oct-2026 payroll was marked PAID on Oct 12. From that moment: **attendance save →
  409 "Attendance is locked — 10/2026 payroll is already paid"**, and **DPR submission is
  locked** (mobile banner "DPR locked — 10/2026 payroll paid. Report via adjustment next period").
- Impact: a real company running payroll early (or processing mid-month advance runs)
  cannot mark attendance or file daily progress reports for ~20 days. The "adjustment in
  next period" escape hatch means site data for half a month lives outside the system.
- Also, attendance controls stay **fully enabled** on the locked period — users mark
  everyone present and only discover the lock at save-time 409.
- **FIXED (this session):** the lock itself is intentional payroll integrity (documented
  in DECISIONS.md). What was wrong was the silent failure — `/hr/attendance` now queries
  PROCESSED/PAID periods up front, shows the same lock banner the mobile page has, and
  disables the status grid, Mark All Present, Save Attendance, and history edit/delete
  for locked dates. Verified: Oct 12 → locked banner + all controls disabled; Dec 15 →
  fully editable. (`hr/attendance/page.tsx`, `components/hr/attendance-view.tsx`)
- Remaining question for the owner: is "correct via next-period adjustment" the right
  product answer for a 20-day freeze, or should an owner-tier override exist? The DPR
  form already has `canOverrideLock` — attendance may deserve the same.

**F2. Assistant/feedback FABs overlap primary actions (mobile, reproducible)**

- On `/m/gate-pass` the **"New gate pass" FAB is unclickable** — the "Open assistant"
  bubble sits on top and intercepts pointer events (Playwright timeout confirmed:
  `gp(318,704,56×56)` vs `assistant(326,716,48×48)` — both `fixed right-4`, assistant wins).
- On `/m/home` the orbit navigator's right/bottom nodes are covered by the two stacked
  orange bubbles; on desktop the assistant + feedback bubbles overlap each other
  bottom-right (visible in `audit-03-light-home.png`).
- **FIXED (this session):** assistant bubble now rests above the page-FAB zone on mobile
  (`bottom ≈ 148px` vs FAB's 68–140px) while keeping `bottom-20` on desktop. Verified
  with a real Playwright click on "New gate pass" — previously unclickable, now opens
  the form. (`components/mobile/assistant/assistant-chat.tsx`)
- Still open: the orbit navigator's nodes still pass under the bubble zone on `/m/home`
  (F7).

### P2 — Functional inconsistencies

**F3. Optimistic UI doesn't roll back fully on failed save**

- After the attendance 409, the employee grid correctly reverted to unmarked (`—`) but
  the **summary header kept showing "Present 7 · 100%"** — stale optimistic state.

**F4. Gate-pass ordering — REVISED (not a bug)**

- On re-inspection the list intentionally groups by operational status for the gate
  guard: **APPROVED (ready to exit) first, then PENDING, REJECTED, EXITED, DRAFT** —
  `MobileGatePassList.tsx` sort. My new PENDING pass correctly trailed the 6 APPROVED
  ones. A truck physically at the gate with an approved pass outranks a pending one.
  Optional refinement: within each status, sort `createdAt desc` explicitly (stable
  sort currently inherits server order, which is already desc).

**F5. Low-stock counts disagree across surfaces**

- Mobile briefing card: "Low stock 1 — Binding Wire 18G". Build page Stock stage: "1 low
  stock". Desktop Today card: "LOW STOCK 0 / 0 healthy". Three surfaces, two answers.
- Root cause: the Today page + `/api/dashboard-counts` measured "low" against
  **`minStock`** (critical floor) while `lowStockAlerts()`, `/api/briefing`, `/build` and
  auto-requisition all use **`reorderPoint`** (time-to-order trigger). Binding Wire sets
  a reorderPoint but no minStock → invisible on desktop.
- **FIXED (this session):** both spots now query `reorderPoint` and use `<=` to match
  `lowStockAlerts()`. Verified: Today card now reads "Low stock 1 · 3 healthy" — agrees
  with mobile briefing and /build. (`app/page.tsx`, `api/dashboard-counts/route.ts`)

**F6. Notification/inbox saturation**

- Unread count climbed 45→49 during the session as every event notifies the OWNER.
  With ~50 unread always-on, the badge stops being a signal. Needs severity tiers or
  a "seen today" auto-dim.

### P3 — Polish / UX inconsistencies

**F7. Mobile home orbit navigator clips labels and collides with FABs** — "Customers"
renders as "…stomers" at the viewport edge; center card overlaps bottom orbit nodes.
Beautiful and distinctive, but tight on 390px.

**F8. Global search gives no live suggestions** — typing in the ⌘K field shows nothing;
only Enter navigates (silently picks best match). Add a dropdown of matches or at least
a "press ↵ to jump" hint.

**F9. Legacy `/requisitions` blank — REVISED (dev artifact)**

- The page is already a server-side `redirect("/procurement?tab=indents")`; the ~3s
  blank was first-visit Turbopack compilation of the procurement page. No app defect.

**F10. Seed/E2E data leaks into owner-facing UI** — "E2E-TEST Customer 0338260",
"E2E-TEST-UNIT-91033518", lowercase "apex center" all appear on dashboards, bookings
and sale documents. Also TMT Rebar was filed under Electrical/Adhesives (fixed in audit).
Demo data should look like a real company.

**F11. "Submit for approval" is a checkbox that swaps the submit button label**
(expense, gate pass) — functional but unusual; a two-button split (Save Draft /
Save & Submit) is more conventional and discoverable.

**F12. Stale dev server on :3100 produced cross-origin `500 /api/notifications/in-app`**
in console. Confirmed an environment artifact, not an app bug — but worth noting the
app fired a request at :3100 while running on :3000 (check NEXT_PUBLIC_APP_URL usage).

**F13. Mobile briefing counts can go stale** — "Approvals 1 expense · 1 leave" while
other items were also pending (stale within minutes; Refresh button exists but is
manual).

**F14. Unrealistic seed finances surfaced as real flags** — Cash/Bank balance
**-₹1.18Cr** (negative bank), 3 GL "abnormal balance" warnings, project spend 417% of
₹2L budget. The abnormal-balance detection works great — the demo data just trips it.

---

## 3. What impressed (worth keeping)

- **GST-native**: HSN master (12,604 HSN + 496 SAC from CBIC notification), CGST/SGST/
  IGST line splits, Input-GST/ITC GL account, **e-invoice IRN generation**, TDS sections.
- **India payroll**: PF, employer-PF, ESI, Professional Tax, advance recovery, OT codes.
- **Real-estate sales**: ATS → BBA → Registry document chain, deposit-as-liability
  accounting, allotment letter/LOI prints, customer portal links, bank-SMS collection.
- **Site ops**: gate-entry numbers, challan capture + scan, offline **sync queue**,
  truck/driver/transporter on gate passes, GPS-check-in copy, DPR locks by period.
- **Accounting rigor**: balanced trial balance check, abnormal-balance detection,
  auto journal posting, Tally two-way sync with pending queue, 50-entry audit log.
- **Construction depth**: BOQ, WBS critical path, measurement book, RA bills with
  TDS + retention, NCR/CAPA, safety, change orders, rate contracts.
- **Notification prefs**: per-event × WhatsApp/Email/In-App matrix.

## 4. Console health

Only 3 real errors across the whole session: 2× `:3100` notifications 500 (stale-server
artifact, F12) and 1× handled `409 /api/attendance` (F1). No unhandled exceptions, no
failed chunk loads, no React warnings — very clean for a dev session this size.

## 5. Coverage still untested

Quotations compare-table, purchase returns/credit notes, stock transfer + counts
execution, petty-cash float ops, bank-SMS reconcile matching, subcontractor RA bills,
change-order approval chain, unit possession/registry completion, external customer
portal, WhatsApp/email delivery, telephony call log, reports/CSV exports, bulk import,
measurement-book + BOQ editing, WBS dependency editing, **non-OWNER role denial**
(everything ran as OWNER), multi-company switching, print-layout fidelity.

## Artifacts

- `audit-01-desktop-home.png` — desktop dark dashboard
- `audit-02-mobile-home.png` — mobile orbit navigator (overlap visible)
- `audit-03-light-home.png` — desktop light theme
- `.playwright-mcp/console-all-errors.txt` — session console log

---

## Fixes applied this session (verified via Playwright)

| Finding                                      | Fix                                                                                                                                                                                                                                                        | Files                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 attendance lock surprise                  | Up-front lock banner + disabled grid/save/history actions on locked dates                                                                                                                                                                                  | `apps/web/src/app/hr/attendance/page.tsx`, `apps/web/src/components/hr/attendance-view.tsx`                                                                                                                                                                                                                                         |
| F1 (mobile variant) self check-in silent 409 | `periodLocked` passed through `/m/home` + `/api/mobile/home`; widget shows lock notice instead of a doomed Check In button                                                                                                                                 | `apps/web/src/app/m/home/page.tsx`, `apps/web/src/app/m/home/adaptive-home.tsx`, `apps/web/src/app/api/mobile/home/route.ts`, `apps/web/src/components/mobile/mobile-self-check-in.tsx`                                                                                                                                             |
| F2 assistant FAB blocks page FAB             | Assistant bubble raised above the mobile FAB zone                                                                                                                                                                                                          | `apps/web/src/components/mobile/assistant/assistant-chat.tsx`                                                                                                                                                                                                                                                                       |
| F5 low-stock count split                     | `reorderPoint` + `<=` everywhere, matching `lowStockAlerts()`                                                                                                                                                                                              | `apps/web/src/app/page.tsx`, `apps/web/src/app/api/dashboard-counts/route.ts`                                                                                                                                                                                                                                                       |
| F16 dispatch dead-end + lost vehicle data    | DRAFT transfer detail now shows "Gate pass GP-xxx is awaiting approval" + link instead of dead Dispatch/Complete buttons; transport fields added to the create form so the auto-created GP carries the truck (approval writes them back onto the dispatch) | `apps/web/src/components/stock/transfers-tab.tsx`, `apps/web/src/components/procurement/transfer-form-dialog.tsx`, `apps/web/src/app/api/transfers/route.ts`, `apps/web/src/app/stock/page.tsx`, `apps/web/src/app/projects/[id]/content.tsx`, `apps/web/src/lib/types.ts`                                                          |
| F17 transfer details duplicate header        | Inner h3+date removed (dialog chrome already renders title+date); status kept as a labelled row                                                                                                                                                            | `apps/web/src/components/stock/transfers-tab.tsx`                                                                                                                                                                                                                                                                                   |
| F17b transfers had no document number        | New `transferNumber` (`TRF-YYMMDD-NNNN` per-company sequence) — schema field + generator in `createTransfer` + surfaced in list, detail dialog title, and both APIs. Existing rows keep `null`. Verified live: `TRF-261012-0001`                           | `packages/db/prisma/schema.prisma`, `packages/services/src/transfer.ts`, `apps/web/src/app/api/transfers/route.ts`, `apps/web/src/app/api/transfers/[id]/route.ts`, `apps/web/src/app/stock/page.tsx`, `apps/web/src/app/projects/[id]/content.tsx`, `apps/web/src/lib/types.ts`, `apps/web/src/components/stock/transfers-tab.tsx` |

`tsc --noEmit` clean, `eslint` clean on all touched files. Browser-verified:
attendance locks Oct/Nov dates and frees Dec; "New gate pass" FAB now opens its
form by real click; Today card shows "Low stock 1 · 3 healthy" (was 0), matching
mobile briefing + /build; mobile home shows "Attendance is locked — 10/2026
payroll is already paid" instead of Check In.

**Transfer lifecycle verified E2E (new):** create (Central→Apex, transport
details) → GP-261012-0003 auto-created PENDING with truck+driver visible →
approve GP → transfer auto-dispatches IN_TRANSIT carrying vehicle/driver/
transporter → source stock -N at dispatch → Complete → destination +N.
Also verified: role-scoped denial as SITE_ENGINEER (`/finance` page denial,
`POST /api/payroll` + `GET /api/expenses` → 403).

**Issue-to-gate chain verified:** `SA-261012-0001` (2 bags cement to apex
center) auto-created GP-261012-0004 PENDING; stock held at 40 until GP
approved, then 40→38 at MAC ₹748 to project WIP. Pending issues already
badge "Awaiting Gate Pass" — no F16-class gap there.

**Stock-count lifecycle verified:** draft count → Confirm Count → Reconcile —
row went DRAFT → COUNTED → Reconciled with 0 variance. "Preview GL" exposes
the accounting entry before posting.

**Supplier-return cycle verified:** RET-20261012-0001 (3 damaged cement bags,
reason column, ₹1,110) → GP-261012-0006 auto-created → approve → Confirm
Exit (photo prompt) → **stock stays booked until finance records the credit
note** — 308→305 only on Mark Completed with CN-SCS-9901. Design question:
goods physically exit the gate while inventory still shows them; the window
between gate-exit and credit-note completion shows wrong stock. Intentional
if completion is the point of financial certainty; risky if a return is
approved+exited but never completed (stock permanently wrong, no warning).

**Petty cash verified:** New Float (Main Gate Petty Cash, custodian Ramesh
Guard, ₹5K) → Spend ₹450 "Site refreshments" → balance ₹4.5K, toast says the
spend auto-books an approved expense + GL entry.

**Claims + CSV export verified:** claim list with columns/CSV/Save View;
export produced a proper dated CSV with real headers.

**Print note fix:** stock-transfer print was using a derived `STN-<id-suffix>`
doc number that matched nothing in the system — now prints `transferNumber`
(TRF-…) with the STN suffix kept as fallback for pre-numbering rows.

**F7 mobile orbit labels — fixed:** nodes whose labels sat beside the centre
card edge or under a neighbour's count badge showed clipped text ("Customers"→
"ustomers", "Workforce"→"orkforce"). Root causes: 80px fixed-width labels
always centred, and dense bottom-arc packing. Fix: labels now hug their text
(`w-auto max-w-24`), side nodes (`|cos|>0.55`) place labels radially beside
the node, bottom-arc labels alternate two rows, and the ring radius is 35%
(was 39%). All 15 department labels verified readable at 390px viewport.
(`apps/web/src/components/mobile/v2/orbit-navigator.tsx`)

**F8 ⌘K live suggestions — reclassified:** live search was verified working —
the palette shows recents/actions/pages instantly and entity results via
debounced `/api/search` ("cement" → OPC material + Shree Cement Suppliers
in ~350ms). The earlier "no suggestions" observation was first-visit
compile delay, not a bug.

**Reports + exports verified:** reports hub groups 18 reports by lifecycle
stage; Purchase Register reads live data (captured RET-20261012-0001 at
-₹1.1K same-session). CSV export → proper headers/data; Excel export →
valid .xlsx (verified zip structure + shared strings).

**Subcontractors/work-orders verified:** WO master with BOQ agreed-vs-rate
deviation flag (₹160 vs ₹145 → ▲15%), progress meters, defect-liability
period, retention ledger (5% verified: ₹24.4K on ₹4.88L), RA bills list.
"Create RA Bill" correctly refuses with "No unbilled MB entries — create and
approve new MB entries first" — measure-then-bill discipline enforced.

**Numbered-transfer lifecycle fully closed:** TRF-261012-0001 created DRAFT
→ GP-261012-0005 approved → auto-dispatch (source −25 cft) → Confirm Receipt
→ COMPLETED (destination +25). Print note shows TRF-261012-0001.

**Minor — no subcontractor detail page on desktop:** `/subcontractors` is a
read-only master table (rows correctly `cursor:auto`, not clickable), but
there's no detail page/drawer to drill into a subcontractor's WOs, payment
history, TDS certificates — mobile has `/m/subcontractors/[id]` with all of
that. Desktop parity gap.

**Fixed — unit status state machine UI/server mismatch (F16):** the unit
dialog offered manual transitions the server rejects —
`AVAILABLE→RESERVED`, `RESERVED→AVAILABLE/SOLD`, `RENTED→AVAILABLE` — every
one a guaranteed 400 ("Invalid status transition … Allowed: "). RESERVED is
set by the sales flow (deposit recorded), released by cancelling the sale —
never a manual state. UI table now mirrors `updateUnitStatus` in
`built-unit.ts`; RESERVED/RENTED units show a "managed via Sales" note
instead of dead buttons.

**Fixed — no unit delete on desktop:** `UnitValuationDialog` now has a
two-step destructive delete (matching the existing `DELETE /api/built-units`
endpoint + mobile's delete), gated to `PLANNED` status — the API rejects
deleting anything further along the lifecycle, so the control only appears
where it can succeed.

**Test-data cleanup performed through the UI:** 13 `E2E-TEST-UNIT-*`
built units (₹50L each — ~₹6.5Cr of fake asset value polluting dashboards)
removed: 4 direct PLANNED deletes, 5 walked AVAILABLE→Construction→Planned→
Delete, and 4 released by cancelling their `E2E-TEST` sales (SAL-20261011-
0001 et al. — cancel correctly refunded deposits and freed units), then the
same status chain to delete. Zero E2E units remain; the units table and
project asset value now reflect real inventory only.
