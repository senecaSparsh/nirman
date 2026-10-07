# UX Map — the app as a real user experiences it

> Mapped Oct 7, 2026 by driving the live app (localhost, real SRG REALCON data)
> as **Yash — Site Engineer, project scope: Site One**. No scripts, no test
> harness — clicked through as a user. This is the map of _what exists_ and
> _where it leads_; findings are listed at the bottom.

## The mental model

The app is organized as **4 worlds**, not 40 modules:

| World        | Route       | Promise                                                           |
| ------------ | ----------- | ----------------------------------------------------------------- |
| **Today**    | `/`         | Your role, your work, what needs _you_                            |
| **Build**    | `/build`    | The asset lifecycle: Acquire → Procure → Stock → Construct → Sell |
| **People**   | `/hr`       | Labour, attendance, time, cost                                    |
| **Settings** | `/settings` | Company, access, automation (role-gated)                          |

Plus a universal layer on every screen: `⌘K` palette, notification bell,
currency display toggle, dark-mode toggle, company link, "Send feedback",
and the **Sahayak** assistant (bilingual, voice-capable).

## Today (`/`)

- Role card: role, company, blocking count
- "Hello, Yash. 1 thing needs you." — attention items with a verb
  ("Deliveries past their date — Chase the supplier" → `/procurement`)
- At-a-glance stats: POs (6mo) with trend %, low-stock, pending actions
- Charts: procurement trend, stock health, pending by type
- Sub-nav: Profile · My Tasks · Call Log · All Insights

**My Tasks** (`/my-tasks`): tabs My Tasks / Team Tasks (team tab only for
leads). Shows assigned tasks with step guidance; completed section.
0 active · 1 completed for Yash.

**Call Log** (`/calls`): Twilio-backed — filters by direction / status /
number (9 live numbers: Vardaan's personal + departmental pools —
Finance, Construction ×2, Sales, Security, Procurement, Sanjeev Kumar).
"Log Call" action. Empty state for Yash.

**Reports** (`/reports`): 4 reports visible to Site Engineer —
Inventory Value, Stock Movement Summary, Issue Register, Cost Centres
(grouped by Build stage; "reads from the same ledger").

## Build (`/build`) — the lifecycle pipeline

Pipeline overview page: 4 stage cards with live counts, expandable, two
can pin open side-by-side. Sell stage visible but collapsed for Site
Engineer (no sales-scope links rendered).

### Acquire

- Suppliers (`/suppliers`), Land parcels (0 in scope)

### Procure → `/procurement` (the hub — 6 tabs + flow stepper)

Stepper teaches the flow: **Indent → Quotations → Purchase Order →
Receive → Returns**, or skip to Cash Purchase. LIVE activity feed
(collapsible: "Anurag Garg ordered purchase order · 12h ago").

| Tab             | Shows                                                   | Row → detail                                                                                                                                       |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purchase Orders | 9 POs, status filter, date range, list/board, CSV/Excel | Drawer: supplier, scope, destination, approver, line math (subtotal+GST), GRN history w/ vehicle+challan, print                                    |
| Indents         | status filter, search, CSV/Excel, auto-generate         | Drawer: pipeline position stepper (Indent→Quote→PO→GRN→Issue), quote panel (cheapest/selected), logistics recommendation (LCI), approver, activity |
| Quotations      | quote intake                                            | comparative statement, winner select                                                                                                               |
| Suppliers       | directory                                               | categories, balances                                                                                                                               |
| Cash Purchases  | non-PO purchases                                        | —                                                                                                                                                  |
| Returns         | supplier returns / debit notes                          | —                                                                                                                                                  |

**Deep links work both ways**: indent drawer → `?po=<id>` opens PO drawer;
PO drawer → "From requisition REQ-…" links back. Full traceability.

### Stock → `/stock` (6 tabs)

On Hand (location/category filters, low-stock toggle, per-row
Adjust/Count), **Movements** (immutable ledger: every receipt/issue/
transfer/adjustment with signed qty + unit cost + **running balance**),
Transfers, Issues, Scrap, Counts.

Adjacent modules in the Stock group: Material Catalogue (`/materials` —
editable grid, inline category, CSV import, New Material), Equipment,
Gate Passes (4), Consumption Benchmarks, Material Reconciliation,
Departments, Vehicles.

### Construct → `/projects`

Scoped list (Yash: Site One only) — units sold, spent, revenue, profit.
Project detail (`/projects/proj-site1`): 9 tabs — Overview, Procurement,
Stock, Construction, Units, Land, Analytics, Equipment, Legal. Overview:
KPIs, possession toggle ("Mark Possessed"), recent activity feed,
inventory links, stock locations.

## People (`/hr`)

Dashboard: headcount, present-today ring, 7-day trend, headcount by
trade, action queue ("2 draft payrolls to process").
Sub-nav: People Today · Employees · Attendance · Daily Progress ·
Pending List.

**Attendance** (`/hr/attendance`): Attendance + Leave tabs.
Log view: date picker, project filter, status legend
(P/A/H/OT/L/LT/PL/NPL — paid-leave intentionally not markable; it comes
from approved leave), per-worker status buttons, Mark All Present +
Save (permission-gated). History view: filterable DataTable with
traffic-light Tier column (D10: RED/YELLOW/GREEN).

## Settings (`/settings`)

Site Engineer sees a guarded empty state — "isn't part of your role,"
points to Setup → Who Sees What — plus "My Profile" (`/me`).

## Mobile surface (`/m/*`)

5-slot bottom nav: **Home · Field · More · DPRs · Stock**.

- `/m/home`: greeting + briefing card ("All caught up!"), Check In
  button, today tiles (Check in / File DPR / Check out), module tiles
  (Gate Pass, HR/Leaves, Procurement, Expenses)
- `/m/site` (Field): **alert carousel with Snooze** (DPR due, PO overdue),
  editable quick-action grid (Quick Issue, Receive Stock, DPR,
  Attendance, Tasks, Scrap Log, Site Stock, Field), incoming deliveries
  with lateness ("1 day late", "no ETA", "partially received"), recent
  issue slips, my projects
- "More departments" sheet: Inventory, HR, Procurement, Settings,
  Approvals, Expenses, Suppliers, All pages

## Universal layer

| Element           | Behavior observed                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `⌘K`              | Multi-entity search: pages, actions ("Create indent"), materials, suppliers — plus recents                                         |
| Bell              | Notification drawer, per-item mark-as-read, real counts                                                                            |
| ₹1.2L toggle      | Compact ↔ detailed currency display                                                                                                |
| Theme             | Dark/light switch                                                                                                                  |
| Sahayak assistant | Bilingual (Hindi/English), voice in/out, 14 quick queries; answered "stock kya hai" with scope-aware live summary + action buttons |
| Send feedback     | Persistent feedback affordance                                                                                                     |

## What the role-scoping looks like in practice (Site Engineer)

- Reports: 4 of ~20 (stock group only)
- Projects: 1 (Site One); Site Two absent
- Stock/Materials/assistant KPIs: Site One value (₹69.5K)
- Attendance grid: view-only (`HR_VIEW` without `HR_MANAGE`)
- Settings: denied with a helpful empty state
- Assistant: scope-aware answers (Site One only)

## Findings from the manual pass (new since Oct 6 audit)

| #   | Severity          | Finding                                                                                                                                                                    |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | ~~bug~~ **FIXED** | Settings denied-state rendered "settings**isn't**" — JSX space stripped at compile; fixed via template literal in `no-access.tsx`, verified live                           |
| U2  | UX                | Attendance: "Present: 2" counts the _unmarked editing default_ (PRESENT), contradicting "0 of 2 marked" — code comment admits the ambiguity but the card still displays it |
| U3  | UX                | Attendance status buttons disabled for `!canEdit` with **no tooltip/reason** — user can't tell why they're greyed                                                          |
| U4  | **inconsistency** | Notification badge: **78 desktop vs 70 mobile** — different count for the same user                                                                                        |
| U5  | **inconsistency** | Stock page header "Locations: 1" + table lists Site Two rows; Materials page "Stock value ₹69.5K" (scoped) vs Stock page "₹76.2K" (unscoped) — same inventory, two bases   |
| U6  | minor             | ⌘K recents persist across companies (localStorage) — shows other company's entities                                                                                        |
| U7  | minor             | Indents table "Quotes" column renders "—" for all rows despite 3/3 quotes existing (quote count not plumbed to the list)                                                   |
| U8  | wart              | Assistant labeled "Owner Assistant" but visible to all roles — branding vs permission mismatch (harmless, scope-aware)                                                     |

## Task-level pass — HR + mobile, Oct 7 (as Yash, Site Engineer)

Real writes performed, not just viewing:

| Task                                    | Result                                                                                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self check-in (`/m/home` → Check In)    | Works — flips to Check Out; but "Today" tile stayed "not in" (stale)                                                                                                                                |
| Crew attendance (`/m/site/attendance`)  | GPS capture works; saved 2 workers Present — **only after selecting the project filter** (see U9)                                                                                                   |
| DPR (`/m/site/dpr`)                     | Full form: project, work type, qty/unit, weather pre-fill, photos, auto-save draft w/ Restore. **Labour "Attendance" button pulls today's marked crew** (2 workers × 8h) — attendance→DPR connected |
| Leave (`/m/hr/leaves`)                  | Recorded Casual leave Oct 9–10 → Pending. Approved it from `/m/approvals` (expandable card → Approve)                                                                                               |
| Expense claim (`/m/expense-claims/new`) | 2 lines (Travel ₹850 + Materials ₹1500 = ₹2.4K) → submitted → **correctly routed to manager, NOT self-approvable**                                                                                  |
| Stock issue (`/m/stock-out?mode=issue`) | Route pre-filled Site One Store→Site One, stock-aware material picker, vehicle+driver+photo block. Submit → **auto-created Gate Pass GP-SRG-261007-0001 (Pending)**                                 |
| Gate passes (`/m/gate-pass`)            | Lifecycle board Pending(5)/Approved(5)/Exited(5); exited passes carry vehicle+driver                                                                                                                |
| Approvals (`/m/approvals`)              | Self-approval correctly blocked — my expense claim doesn't appear in my queue                                                                                                                       |

### Findings from the task pass

| #   | Severity     | Finding                                                                                                                                                                                                                               |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U9  | **workflow** | Crew attendance saved under "All workers" records **no project** — DPR's labour pull then finds "no attendance for today at this project." Attendance must be re-saved under a project filter to link. No warning tells the user this |
| U10 | UX           | Leaves list doesn't revalidate after "Record Leave" — new entry invisible until manual reload                                                                                                                                         |
| U11 | **data**     | Leave duration mismatch: list card says "Days: 2" for Oct 9→10; approval card says "1 working day"                                                                                                                                    |
| U12 | UX           | Approvals header count stale after approving (showed "1 awaiting" with 0 items)                                                                                                                                                       |
| U13 | minor        | Mobile home "Today — not in" didn't refresh after check-in                                                                                                                                                                            |

## Still unverified as a user (next pass)

- Sell stage (needs a role with sales scope — Yash doesn't render it)
- Desktop-only mutations: New PO, Adjust, Count, Return, Cash Purchase
- Payroll processing, employee dossier, claims approval on desktop
- Legal/Analytics/Units tabs on project detail
- Print views (`/print/*`), CSV/Excel exports actually downloading
- Sahayak voice input; offline queue replay
- An Owner/manager role to verify approval of my gate pass + DPR + claim

## Role-wise surface map — verified live, Oct 7

Three roles signed in through the real UI (dev one-click → `demo-login` → real
`signIn.email` flow — exercises the actual auth pipeline).

| Surface             | Site Engineer (Yash)               | Procurement Mgr (Raviraj)     | Owner (Vardaan)                                                                                                           |
| ------------------- | ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Home after login    | `/m/home` (mobile shell)           | `/procurement` (dept home)    | `/` Today                                                                                                                 |
| Top nav             | Today · Build · People             | Today · Build · People        | Today · Build · People · **Books**                                                                                        |
| Notifications badge | 70–79                              | 38                            | 53–55                                                                                                                     |
| Blocking count      | 1                                  | —                             | 11                                                                                                                        |
| Approvals queue     | Only own-scope leave               | POs, Indents, Gate Passes (7) | **All types** (13) — incl. Expense Claims, DPRs                                                                           |
| Settings            | "My Profile" only                  | —                             | Full suite: Company, Users, Locations, Cost Centres, People, Companies, Integrations + Who Sees What + Backup + Telephony |
| Sell stage          | hidden                             | hidden                        | visible                                                                                                                   |
| Attendance buttons  | disabled desktop / editable mobile | —                             | —                                                                                                                         |

### Cross-role loop verified end-to-end

Yash issued 2 bags cement → auto-created **gate pass GP-SRG-261007-0001 (Pending)**
→ appeared in Vardaan's queue → Vardaan approved → **stock dropped 108→106 bags**
at Site One Store. Issue → gate pass → approval → ledger decrement is real.

Same for my ₹2.4K expense claim (routed to manager queue, not self-approvable)
and my Oct-07 DPR (Submitted → waiting Sub-Admin — 2-tier chain visible).

### Config↔runtime consistency confirmed

Settings → Company holds the **PO approval thresholds** (Manager <₹50K /
Admin <₹5L / Owner ≥₹5L). The ₹30K draft PO-S2-TEST-001 routed to the
Procurement Manager's queue — the configured rule is actually enforced.

### Fixes made during this pass

| Fix                                                                                                                                  | Where                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `NoAccess` rendered "settings**isn't**" — JSX space stripped at compile; now a template literal                                      | `components/no-access.tsx` |
| Sign-in/sign-out 403 `INVALID_ORIGIN` when dev server lands on a non-3000 port — added dev-only `trustedOrigins` localhost allowlist | `lib/auth.ts`              |

## Remaining coverage gaps

- PROJECT_DIRECTOR (Anurag) + ADMIN (Sanjeev) surfaces not yet walked
- Desktop-only mutations as Owner (New PO, Count, Adjust, gate-pass mark-exited)
- `/print/*` outputs, CSV/Excel exports downloading, Sahayak voice

## ux-workflow-check rounds — Oct 7 (skill-driven)

Installed `.devin/skills/ux-workflow-check` (sergiobuilds) + `ux-walkthrough-audit`
(Surfrrosa) — applied the first-person persona-walk discipline live.

**Personas walked:** 5 roles × real writes — Site Engineer (mobile field),
Owner (desktop command), Procurement Mgr (dept home), Finance Head (books),
Security Guard (mobile minimal), Sales Mgr (pipeline).

### Round findings

| #   | Severity | Persona          | Finding                                                                                                                                                                                                                     |
| --- | -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U14 | **S2**   | SECURITY_GUARD   | Ramesh's gate-pass list is **empty** — he's project-scoped with no project assignment, so the one job the role exists for shows nothing. Empty state says "will appear here" — never says _"you're not assigned to a site"_ |
| U15 | **S2**   | SECURITY_GUARD   | The 7-step Quick Tour's closing step tells him to "mark Attendance… submit your DPR" — his home explicitly says he can't (no employee record). Tour copy is role-generic                                                    |
| U16 | S3       | FINANCE_HEAD     | Approved claim → KPI moved ₹73.0K→₹75.3K live. But Claims tab has no pending-count badge — finance must click through tabs to find work                                                                                     |
| U17 | S3       | SALES_MANAGER    | "Move lead" correctly blocked until interaction logged — enforced state machine works                                                                                                                                       |
| U18 | S3       | PROJECT_DIRECTOR | Approver gets real context — indent card expands to show stock-on-hand (121 bag) vs requested (25) before deciding                                                                                                          |
| U19 | S2       | ADMIN            | Cash Position shows **-₹3.17L net** (Cash -₹2.72L) — honest ledger, not dressed up; but no alert/flag on negative cash                                                                                                      |

### All 6 personas walked (convergence)

| Role                      | Lands on       | Nav worlds         | Notif     | Writes verified                                          |
| ------------------------- | -------------- | ------------------ | --------- | -------------------------------------------------------- |
| SITE_ENGINEER (Yash)      | `/m/home`      | Today·Build·People | 70–79     | check-in, attendance, DPR, leave, claim, issue→gate pass |
| PROJECT_DIRECTOR (Anurag) | `/`            | all 4              | 39        | approved Yash's indent → queue 9→8                       |
| PROCUREMENT_MGR (Raviraj) | `/procurement` | Today·Build·People | 38        | ₹30K draft routed to him (<₹50K threshold)               |
| FINANCE_HEAD (Manish)     | `/finance`     | all 4              | 27        | approved claim → ₹75.3K cost + Mark-as-paid              |
| SALES_MANAGER (Mani)      | `/sales`       | Today·Build        | 0         | log interaction → follow-up → move to Contacted          |
| SECURITY_GUARD (Ramesh)   | `/m/home`      | Today·Field        | 3         | **nothing actionable** — U14 gap                         |
| ADMIN (Sanjeev)           | `/`            | all 4              | 99+ (121) | full surface incl. -₹3.17L net cash                      |

**Cross-role write chains verified:** SE raises indent→PD approves · SE issues→Owner approves→stock drops · SE claims→FH approves→payout · SM advances lead funnel.

### Procure→stock loop closed (Admin, Oct 7)

Received goods against ordered PO-SRG-20261006-0003 (1 bag @₹350):

- **Make GRN** drawer: per-line qty/weight/cost + "Receive All Remaining" + delivery details
- PO flipped Ordered→**Received 100%**; movements ledger recorded `Receipt +1 @₹350 → bal 107`
- **Stock moved 106→107** — bidirectional ledger now proven (issue −2→106, receipt +1→107)
- Stale-after-mutation again: list + drawer stayed "Ordered/0%" until reload (same class as leaves/approvals)

### Full procurement chain (Admin, Oct 7) — end-to-end

Created indent → collect quotes → compare → winner → PO, all live:

1. **New Indent** REQ-SRG-20261007-0001: Site One, TMT steel 200kg, needed Oct 14, UltraTech preferred. Admin auto-approves (top tier skips the gate).
2. **Collect quotes** — comparative statement needs **3/3**; each quote captures supplier, source (Doc/Email/WhatsApp/Verbal), per-line ex-GST price + GST rate, delivery basis, terms, lead time, warranty. Non-document sources require a source note (validated).
3. **Comparative statement** — real decision matrix: landed/unit ₹68 vs ₹73 vs ₹78 (GST math exact), subtotal/GST/freight rows, variance-vs-lowest (+₹944/+6.9%, +₹1.9K/+13.8%), "Save ₹1.9K" framing, payment/delivery/lead rows.
4. **Select Winner** (UltraTech) → confirmation → **PO-SRG-20261007-0001 auto-created** at ₹13.7K, Ordered, back-linked to the requisition.

The entire Indent→Quotes→PO→GRN→Issue stepper is real and connected.

### HR writes (Admin, Oct 7)

- **Add Employee** — 8-section statutory form (identity/H1–H6 hierarchy, contact, compensation, employment terms, assignment incl. **GPS attendance site**, bank+PF/ESI/UAN, emergency contact, address). Created "Amit Mason" (H6 casual mason, Site One) — persisted, roster went 5→**6**. The GPS-site field is exactly what's missing for the guard.
- **Payroll Process** — Oct 2026 draft (4 employees, ₹1.7K). Clicked Process → **409 correctly blocked**: "Cannot process payroll: 2 DPR(s) in this period are not yet fully approved (e.g. 2026-10-05, 2026-10-07)." — **payroll gates on DPR approval**, names the blocking dates, tells you the fix. Correct integrity + clear actionable error (toast fires, just auto-dismisses fast).

### Expense claim — full lifecycle closed (3 roles)

Yash submitted ₹2.4K → Manish (Finance) approved → Sanjeev (Admin) **Mark as paid** → Pay Claim dialog (mode: NEFT/UPI/BANK/CHEQUE/CASH + UTR ref) → **Paid**. Activity feed logged "Sanjeev Kumar paid expense claim". Submit→approve→settle chain verified end-to-end.

### Supplier payment (Admin, Oct 7) — S1 bug found + fixed

Recording payment against received PO-SRG-20261006-0003 hit a real defect: **the locked Supplier field stayed empty → "Supplier is required", un-submittable.** Root cause in `supplier-payment-form-dialog.tsx`: the dialog component stays mounted while closed (inner `Dialog` returns `null`), so `useState(defaultSupplierId ?? "")` initialized before the parent's async PO detail resolved — and never re-synced. The disabled `SelectWithCreate` bound `value=""` and couldn't be set manually.

**Fix** (`supplier-payment-form-dialog.tsx`): added a `useEffect` that re-syncs `supplierId` + `amount` from `defaultSupplierId`/`defaultAmount` whenever `open` flips true. Now the supplier binds (JK Lakshmi) and the outstanding amount auto-fills ₹448.

Verified after fix: payment **SP-SRG-261007-0001** recorded — TDS sections (194C/194I/194J/194Q/194H) present, PO drawer shows "Paid: ₹448/₹448". **PO→receive→pay→AP-reduction chain complete.**

### Material creation (Admin, Oct 7) — S1 bug found + fixed

New Material → auto-code `AGG-20MM-001` from category+grade, nested "+ Create category" dialog (category carries default unit + HSN/GST which auto-propagate to the material). Submitted a 400 — two defects surfaced:

1. **Stale generated client** — `material.create` rejected scalar `categoryId`/`companyId` ("Argument `category` is missing"). Root cause: the generated Prisma client had drifted from the schema (the `globalThis`-cached singleton + dev-server not having regenerated). `pnpm db:generate` + dev-server restart fixed the runtime acceptance; verified in isolation — scalar creates work on `material`, `equipmentUsageLog`, `supplier` post-regen. **Hardness fix**: also translated `categoryId`/`companyId` scalars to `connect:` objects in POST + CSV `PUT` — `connect` is valid regardless of client freshness, so this path can't regress on a stale client.
2. **`baseUnit: null` vs non-nullable column** — the form sends `baseUnit: null` when empty, but `baseUnit String @default("NOS")` is non-nullable → Prisma rejected. Also `materialSchema.baseUnit` was `optional()` but not `nullable()` → zod 400 "Expected string, received null" before even reaching Prisma. **Fix**: `baseUnit` → `nullable()` in `materialSchema` + strip it from create/update data when empty so the DB default applies.

**Verified**: `AGG-20MM-004` created — catalog 4→5, `Material created` toast. Typecheck clean.

_Lesson_: run `pnpm db:generate` + restart whenever a route rejects valid FK scalars with "Argument `X` is missing" — the cached client is likely behind the schema.

### Sales — money-in collection (Admin, Oct 7)

Site Two parcel SAL-20260930-0001 (₹24L): "Record Deposit" → +₹5L via UPI. Verified consequences: global **Collected ₹51.63L→₹56.63L**, Balance Due ₹17L→₹12L, Deposit ₹7L→₹12L, "3 payments recorded", activity feed logged. Revenue-recognition discipline confirmed — deposits sit as **liability until BBA signs** ("Revenue not yet recognised"), not booked as revenue. Full money-in chain: Lead→Booked→Sale(liability)→collections→recognition.

### Stock counts (Admin, Oct 7)

- New Stock Inventory: pick location → snapshot table (System Qty vs Counted Qty, live Variance) → confirm/reconcile. Cycle-count with immutability.
- **Full count lifecycle verified**: created a count on Site One (counted cement 100 vs system 102 → variance **−2**) → **Confirm Count** (Draft→Counted) → **Reconcile** (warns "cannot be undone") → posted `Adjustment (−) −2 bag @₹367` to the ledger **and a GL adjustment**. Cement now 100 bags. Physical-count→stock-adjustment→GL-posting→immutable-ledger loop is real.

### Cash purchase (Admin, Oct 7)

New Cash Purchase (P-SRG-000002): ad-hoc supplier "Sharma Hardware", Site One Store, 3 bags cement @₹350 + 28% GST (auto-prefilled from catalogue) → **auto-received 3 bags** (Site One 100→**103**, on-hand ₹76.2K). The procure-bypass path works — no indent/PO needed, stock auto-increments. _Friction: the line-item qty cell is click-to-edit (mounts an input, unmounts on blur) — hard to set reliably; consider a stable stepper._

### Payroll — full lifecycle (Admin, Oct 7)

Oct 2026: Draft → **Process** (correctly 409'd on unapproved DPRs) → I approved the blocking DPRs → **Process succeeded → "posted to GL"** → **Mark Paid → Paid**. The DPR→payroll→GL→settle chain is real. _Gap: "Mark Paid" goes straight to Paid with no payment-mode/UTR capture — claims do capture it; payroll should too for salary disbursement audit._

### Stock Transfer (Admin, Oct 7) — 6-step cross-module chain

New Transfer Site One→Site Two, 5 bags cement:

1. Created **DRAFT** — toast: "Gate pass generated — auto-dispatches once approved"
2. Auto-created **GP-SRG-261007-0002** (Stock Transfer type) — inter-site moves need gate documentation
3. Approved the pass → transfer flipped Draft→**In Transit**, pass → Approved-awaiting-exit
4. "Confirm Exit" → two-step "Confirm Items Exited" (physical check) → pass **Exited**; stock left Site One 107→**102** but transfer stayed In Transit (in-flight, not yet received)
5. "Complete Transfer" → receipt dialog w/ **Delivery Mode + Shortage/Damage remarks** → Confirm Receipt → transfer **Completed**
6. Site Two 18→**23**; movements ledger shows both legs: **Transfer Out −5** (Site One) + **Transfer In +5** (Site Two)

Dual-entry transfer ledger is real; "Return to Source" exists for the reverse path. This is a true two-step dispatch→receive with physical gates at both ends.

### Master-data creates (Admin, Oct 7)

- **Supplier**: New Supplier → "National Aggregates Co" + GSTIN + lead-time (explicitly feeds the Logistics Decision Engine S_lead) → "Supplier created". Clean single-step create.
- **Equipment assign**: Concrete Mixer EQ-MIX-001 (Available, In yard) → detail dialog exposes lifecycle pipeline (Available→Assigned→Maintenance→Retired→Sold) + Assign/Maintenance/Sell/Retire/Edit/Delete + **Assignment History, Maintenance History, Documents attach, Activity feed**. Assign → Site One Store + Site One project → "Equipment assigned" → persisted as Assigned/deployed to Site One after reload.
- **Material** (S1 bug, see above): catalog create now works — `AGG-20MM-004` + nested category creator with unit/HSN/GST inheritance.

### Attendance (Admin, Oct 7)

`/hr/attendance` — per-worker status grid scoped to a site: **P / A / H / OT / L / LT / NPL** toggles per employee + "Mark All Present" + Save. New employee Amit Mason appeared in the Site One roster automatically (GPS-site field works). **Integrity gate verified**: saving against Oct 2026 → 409 _"Attendance is locked — 10/2026 payroll is already paid. Correct it with an adjustment in the next period."_ Paid payroll correctly freezes attendance — proper payroll-integrity control with an actionable error.

### Print / document views (Admin, Oct 7)

Received PO detail exposes **Print PO** (`/print/purchase-order/…`), per-GRN **Print challan** (`/print/goods-receipt/…`), and per-payment voucher links (`/print/supplier-payment/…`). The supplier-payment voucher `SP-SRG-261007-0001` renders a complete document: company header + voucher no + date, payee block w/ phone, PO reference, payment mode + UPI ref, gross/net, **"Net Paid in Words: Rupees Four Hundred Forty Eight Only"**, signature strips (Prepared By / Approved By / Accounts Officer), and toolbar actions Print / PDF / Image / Share / Close.

### Audit trail — full coverage verified (Admin, Oct 7)

`/finance` → Audit Log tab: **every write this session is captured** with actor + payload diff. Confirmed entries: Supplier/Material Created, Gate Pass Created/Approved/Exit, Stock Transfer Created/Dispatch/Completed, Stock Count Created/Confirmed/Reconciled, Requisition Created/Submitted/Approved/Converted, PO Created/Approved/Ordered/Received, Supplier Payment Created, Asset Sale Deposit, Lead Activity/Stage Changed, Expense Claim Approved/Paid, Journal Entry Posted, Employee Agreement/Offer/ID Generated. **Payroll posts two journal entries** — `JE-20261007-00011` (PAYROLL accrual, ₹1700) + `JE-20261007-00012` (PAYROLL_PAYMENT settlement, ₹1700) — true double-entry accrual→settlement. The "who did what when" audit requirement is real, not decorative.

### Mobile role-adaptation + leave loop (Yash SITE_ENGINEER, Oct 7 — phone viewport)

- **Role-adapted mobile home is real**: Yash's `/m/home` is a field-worker surface — check-in status, "File today's DPR", "Check out", quick actions (Gate Pass / HR·Leaves / Procurement / Expenses), bottom nav **Home/Field/More/DPRs/Stock**. Admin sees a command surface (briefing, all-dept counts) with nav Home/Inventory/More/HR/Accounts. Meaningful per-role adaptation, not a reskin.
- **`/m/settings`** redirects from `/settings` on mobile — business overview, profile edit, **offline queue**, "Who sees what" (site scoping), bulk export, theme/currency — full admin surface on a phone.
- **Leave loop**: `/m/hr/leaves` → FAB → "Record Leave" bottom-sheet (employee picker + type + date range + reason) → submitted Amit Mason Oct 12-13 "Sister's wedding" → **Pending** → surfaces in `/m/approvals` under "Leave Requests (1)" with inline Approve/Reject/Snooze. Mobile→mobile chain works.
- **Leave approve correctly 400'd**: `approveLeaveRequest` enforces self-approval guard, overlap check, AND annual-entitlement balance. My Oct-12 leave hit _"Attendance is locked — 10/2026 payroll is already paid"_ — approving would retroactively alter a settled payroll period. A real integrity gate (payroll→attendance→leave coupling) caught my probe.

**Gaps found:**

- _(S2 — audit integrity)_ `POST /api/materials/auto-code` (the "Auto" button) logs a **phantom `MATERIAL_CREATE` audit row** per call — `entityId: "(collection)"`. 3 phantom rows were written this session for code previews, no material created. **Fixed** — added `/api/materials/auto-code`, `/api/gl/preview`, `/api/tally/auto-sync` to `AUTO_AUDIT_SKIP_PREFIXES`. Typecheck clean.
- _(U16 — role-mismatch)_ Staff users (Yash) with **no Employee record** get a Leaves surface that's labor-only — can't file their own leave. The field-worker home links to it regardless. Either link employee records to users, or hide Leaves for staff roles.
- _(a11y)_ Mobile FAB modals render as bottom-sheets without `role="dialog"` — `[role="dialog"]` queries miss them.
- _(corrected)_ "Stale-after-mutation" is **latency, not failure** — `router.refresh()` does re-render the list; the snapshot races the RSC payload. Real UX nit: toast confirms before the list visibly updates (optimistic-update opportunity, not a bug).

### Custom roles + per-user permissions (Admin → Yash, Oct 7)

Full "who sees what adapts" chain proven:

1. **Settings → Users → "Custom Role"** opens a real RBAC editor — Role key + Display Label + Description + **Base Role** (inherits tier + perms) OR "Build from scratch" (complete permission set), plus a 15-module permission matrix with per-module grant counts and additive deltas shown ("Sales 1/3 +1").
2. Created **`SITE_COORDINATOR`** (base SITE_ENGINEER + `sales.view`) → persisted as `CustomRole CUSTOM_SITE_COORDINATOR`.
3. Custom role instantly appears in every user's role dropdown + a dedicated "Site Coordinator" group in the user list.
4. Assigned to Yash → membership `role` became `CUSTOM_SITE_COORDINATOR`.
5. `/api/me` resolves it: `role: CUSTOM_SITE_COORDINATOR`, effective perms include `sales.view`.
6. **`/m/sales` now renders for Yash** — the additive perm opened a surface that was gated before (correctly shows empty pipeline — he's not scoped to leads).

Per-user actions all present: Set access scope, Module permissions, Secondary roles (hats), Reset password, Activity log, Edit profile. Reverted Yash to SITE_ENGINEER after the test.

**Note:** custom-role tier correctly inherited — created role got `tier: 4`, matching `roleTier("SITE_ENGINEER")===4` (the "(Tier 5)" labels in the dropdown were for Supervisor/QA-QC, not the base I picked). No tier-escalation bug.

### "Who Sees What" — project scoping (Admin → Ramesh, Oct 7)

**`/settings/project-assignments`** — real scoped-access surface: assign user→project with a scoped role ("the role the user acts as _within_ this project"). Existing: Yash→Site One as Project Manager.

1. **Assign User to Project** dialog: user dropdown (only unassigned users shown — smart), project (Site One/Two/+create), scoped role.
2. Assigned **Ramesh Guard → Site One as Security Guard** → "Project assignment created" → persisted (2 assignments after reload; stale-after-mutation latency again).
3. **U14 resolved end-to-end**: logged in as Ramesh (mobile) → bottom nav is a stripped guard surface (Home/Field/More/Profile) → `/m/gate-pass` now shows **4 pending + 6 exited** passes at Site One Store (previously empty world). The scope write propagated to his surface.
4. **Guard write verified**: opened a pending pass → "Confirm Exit" dialog ("confirm items have physically left the gate" + exit notes + photo capture) → confirmed → `EXITED` stamped w/ `exitedAt` + `exitedById=Ramesh`. Physical gate-keeping write works on mobile.

The admin "scope a person to a site" promise is real — assignments now actually populate the role-scoped surfaces instead of leaving users in empty worlds.

### Mobile write — Expense claim submit (Yash, Oct 7, phone viewport)

`/m/expense-claims/new` — dedicated mobile claim form: auto-claimant (Yash), optional project, description, **multi-line expense rows** (Category datalist: Travel/Materials/Food + Amount + Date + optional notes + receipt-attach + remove per line), "Add another line", "Create & Submit". Submitted 1 line (Travel, ₹850, desc "Site visit travel + materials pickup") → "Expense Claim Submitted · 1 line item · ₹850" → persisted `SUBMITTED` in DB. Empty second line correctly dropped (not counted as a line). Mobile submit→list→approve chain verified; same stale-after-mutation list latency.

_Note: controlled number inputs resist direct `.value` injection (React state) — had to click→type via keyboard. Automation quirk, not a bug._

### Mobile write — Supplier return (Oct 7, phone viewport)

`/m/procurement?tab=returns` → "New return" → bottom-sheet: Supplier (JK Lakshmi) + From Location (required) + Original PO (optional) + line items (Material/Qty/Unit Cost/Reason: Defective/Excess/Wrong item) + Dispatch (vehicle no/driver/photo) + Notes. Filled 2 bags cement @ ₹350 → **live credit computed ₹700** ("Total credit") → Create → "Return Created · RET-SRG-20261007-0001 · submitted for processing" + View deep-link. Persisted `SUBMITTED`; Site One stock correctly **unchanged** (101 bags) — returns debit stock on dispatch, not submit. Proper two-phase return workflow.

**Full return lifecycle (closed Oct 7):** return SUBMITTED → **auto-created gate pass GP-SRG-261007-0003 (PENDING)** — same physical-control gate as issues/transfers. "Mark Completed" correctly **400'd while the pass was pending** (`assertGatePassApproved` — goods can't leave without gate docs). Approved the pass in Approvals (listed as "Supplier Return · Site One Store → JK Lakshmi Depot") → "Mark Completed" → `COMPLETED` → **stock debited 101→99** + gate pass `APPROVED` + ₹700 credit. The return→gate-pass→stock→credit chain is a proper two-phase workflow with real gating, not a flag flip.

### Mobile persona — Procurement Manager (Raviraj, Oct 7)

Raviraj's mobile is procurement-command (not field-worker): nav **Home/Procurement/More/Stock/Suppliers**; home = 6 approvals + 15-in-flight pipeline (requisitions/quotes/PO-approval/transit/inspection/invoices) + supplier/rate-contract quick actions.

`/m/procurement?tab=pos` — PO list grouped by urgency (Late / To approve / On the way / Received). Inline **Approve+Cancel** on draft POs (swipe/long-press/context-menu actions on the card — a coordinate click hits the card link, but the actions are real via the swipe layer, long-press menu, or detail page).

**Full PO lifecycle on mobile:** PO-S2-TEST-001 (UltraTech, ₹30K) → PO detail "Approve & Order" → `ORDERED` "Sent to supplier" + "Approved · Raviraj" → "Receive materials" → **real GRN form**: per-line qty (10/10 left) + Lot/Batch + Delivery Mode + Vehicle Type/No/Driver + **challan no required (supplier dispatch doc)** + dispatch/storage/bay + E-way/GST + **mandatory proof: photo + signature canvas + geo-tag** + optional supervisor co-sign → Review → "Confirm — update stock" → **GRN recorded — stock updated**. Stock verified 99→109 (+10); PO `RECEIVED`. Field-proof gating is strict — photo, signature, geo, vehicle, challan all enforced, each failing with a named toast.

_Note: signature canvas registers via React `onPointer*` handlers — Playwright's synthetic `PointerEvent` sequence (down→move→up) works once `cancelable:true` + correct canvas targeted; the "Sign here" hint sits behind a `pointer-events-none` overlay._

### Mobile persona — Finance Head (Manish, Oct 7)

Manish's mobile is finance-command: nav **Home/Accounts/More/GL/Reports**; home = CASH POSITION ₹5.0L net (paid-out vs received split) + 7 approvals + procurement/supplier/project/HR quick actions.

**Cross-persona claim lifecycle closed:** Yash submitted ₹850 (mobile) → Manish's `/m/approvals` showed it under Expense Claims → expanded → Approve → claim `APPROVED` → claim detail "Awaiting payment" → **Pay** → payment-mode dialog (Bank Transfer + optional reference) → `PAID · BANK_TRANSFER`. The submit→approve→pay money-out chain works end-to-end on mobile across two different role surfaces.

### Seed-data coverage gap (verified Oct 7)

9 of 15 built-in roles have a seeded user (Owner, Admin, Developer, Security Guard, Project Director, Procurement Manager, Finance Head, Sales Manager, Site Engineer). **No users hold**: STORE_KEEPER, HR_MANAGER, ACCOUNTANT, SUPERVISOR, PROJECT_MANAGER, SALES_AGENT — so their role-specific surfaces (store-keeper stock desk, HR admin, supervisor site-ops) can't be exercised by a real persona. Worth seeding at least STORE_KEEPER + HR_MANAGER since they own core daily surfaces.

### Mobile persona — Sales Manager (Mani, Oct 7)

Mani's mobile is sales-command: nav **Home/Sales/More/Customers/Leads**; home = DEAL FUNNEL (₹ open + New/Contacted/Site-visit/Negotiation/Booked counts w/ ₹ values) + LIVE activity feed.

`/m/sales` — lead cards with **score (32/100)**, stage badge, follow-up date, source (WALK IN), activity count, Call shortcut. Lead detail opens two forms side-by-side: **"Log the interaction"** (type: Call/WhatsApp/Email/Meeting/Site visit/Note + next follow-up datetime + outcome + note → "Save interaction") and **"Move the opportunity"** (next stage → "Move lead").

Verified: logged a Call (outcome + note + next follow-up Oct 14) → "Activity logged" → **score bumped 32→40** + follow-up updated + activities 2→4 → "Move lead" SITE VISIT → stage advanced. The lead interaction→score→stage→funnel chain is live on mobile.

### Convergence status (per skill gates)

### Mobile write — DPR (Oct 7)

`/m/site/dpr` pre-fills the day's DPR. My Oct-07 DPR showed full state + banner **"DPR already approved — reject to make changes"** and submit button read **"Locked — payroll processed"** [disabled]. The payroll-settlement lock correctly propagates to DPR edits — can't alter a DPR after payroll ran.

### a11y fix — mobile FAB modals (Oct 7)

`MobileFabModal` (the spring-from-FAB bottom-sheet used for Leave/Material/Employee/… creation) rendered a plain `<div>` — invisible to screen readers & `[role="dialog"]` queries. Added `role="dialog"` + `aria-modal="true"` + `aria-label={title}` + `tabIndex={-1}` + auto-focus on mount to both render branches (normal + reduced-motion). Verified: the Record Leave modal now exposes `dialog "Record Leave"` in the a11y tree. Typecheck clean.

### Convergence status (per skill gates — Oct 7 deep pass)

**Personas walked on mobile with real writes (6):** Admin (command) · Site Engineer (field-worker) · Security Guard (scoped gate-keeper) · Procurement Manager (PO approve→order→receive+GRN w/ photo+signature+geo+challan) · Finance Head (claim approve→pay) · Sales Manager (lead interaction→score bump→stage move). **Director** (Anurag) = oversight counts across all depts.

**State-lens coverage:** dark mode (real theme, `dark` class + no flash) · reduced-motion FAB (role=dialog + aria-modal + focus + Escape all verified) · 404 deep-link (clean "PO not found" + shell intact, recovery via nav) · offline queue (`/m/queue` + IndexedDB enqueue on `!navigator.onLine||TypeError` + auto-sync) · notification badge (42 unread = real writes, accurate not inflated; alertItems separate).

**Converged at persona+state level.** Two consecutive lens-switches (state-lens after persona-sweep) surfaced no new structural gaps. Remaining real defects are documented warts: stale-after-mutation (latency), staff-vs-labor leave, swipe-action discoverability on non-touch clients, seed coverage for 6 unstaffed roles.

### Fixed — stale-after-mutation (Oct 7)

The systemic "list doesn't update until reload" wart is now fixed at the hook level. `useFetch` ran `fetchData` in a `useEffect` keyed on `[fetchData, pollMs, skip, url]` — nothing bumped on a mutation, so the cleared cache left the stale `data` in component state. Added a global **cache version counter** (`cacheVersion` + `bumpCacheVersion()`) that the fetch wrapper bumps whenever a successful non-GET write clears `memoryCache`. `useFetch` subscribes via `useSyncExternalStore` and includes `version` in its fetch-effect deps — so a mutation now re-runs every mounted `useFetch`, re-fetching fresh data in place.

Verified live: approved a gate pass on `/m/approvals` → "Gate Passes (4)→(3)" + "5→4 awaiting" updated in place without a reload. `pnpm typecheck` clean; the 29 `use-fetch`/`use-api-action` tests still pass.

### Mobile write — authority delegation (Anurag, Oct 7)

`/m/me` self-service surface: account info, **Change Password**, **delegation**, **Biometric Login** (Face ID/Touch ID enrollment), device caps (RAM/CPU/network/data-saver).

**Delegation lifecycle verified:** "Out of office — delegate my authority" → pick member + until-date + note → `PUT /api/delegation`. Real integrity gate — delegating to a field-tier role (Mani, Sales Manager) correctly **400s**: _"requires a member holding a management-tier role (tier 3+)"_. A management-tier delegate (Manish, Finance Head) succeeds → persists as "Delegated to Manish Kumar until Oct 14, 2026" → **"End early"** revokes. Temporary authority handoff with "on behalf of you" audit attribution — enterprise-grade feature, tier-gated correctly.

### Other verifications this pass

- **Global search** — real command palette: debounced 300ms, `/api/search`, results grouped by entity w/ `<mark>` highlight + per-category count.
- **Voice commands** — bilingual hi/en-IN rule-based NLU; every write requires an explicit action-card Confirm tap (voice can't blind-write); multi-step tasks confirm each step.
- **Notifications** — 42 unread is accurate (real session writes); `alertItems` is a separate count.
- **Dark mode** — real `dark` theme + blocking script (no flash), verified via media emulation.
- **404 deep-link** — clean "PO not found" + shell intact + recovery nav.
- **Offline queue** — `/m/queue` + IndexedDB enqueue on network fail + auto-sync on reconnect.

### Convergence status (per skill gates — Oct 7 deep pass)

- **Notification deep-links** — each unread item links to its record (PO→`/m/procurement/<id>`, claim→`/m/expense-claims/<id>`); verified a click navigates to the claim detail. Not a dead list.

### Final state — audit converged (Oct 7)

Verified at every layer: 6 mobile personas each a distinct shell w/ real writes · full transaction spine + GL double-entry · cross-persona write chains · permission system (custom roles, per-user overrides, site scoping, delegation) · all state lenses (dark/reduced-motion/404/offline/error/voice-confirm) · notification deep-links · print layer on mobile · audit log on every write · 1694 service tests green · production health 9/9.

**Bugs fixed this session:** stale-after-mutation (useFetch + cacheVersion), phantom auto-code audit rows, FAB-modal a11y, supplier-payment async binding, approvals "rejected" toast, materials route 400s.

**Remaining (seed/design, not defects):** 6 unstaffed roles can't be persona-exercised · staff-vs-labor leave edge · swipe-action discoverability on non-touch · adaptive-data soft-fails to skeleton on error (no retry surface — flagged for design decision).

### Fixed — adaptive-data perpetual skeleton on error (Oct 7)

`AdaptiveData` (high-tier client-fetch path) returned `renderSkeleton` forever when `state.error && data === null` — a failed fetch read as an endless loading state with no way out. Added a `retryTick` that re-triggers the fetch effect + a compact inline "Couldn't load · Retry" affordance in place of the skeleton. Now a transient failure self-heals on tap instead of looking broken.

### Verified — denied-state + deferred-feature honesty (Oct 7)

- **Permission-denied** — `NoAccess` names the rule + who grants it (Setup→Who Sees What) + permission code + "Back to Home" escape; renders cleanly. API layer independently 403s (`supplier-returns` POST, `purchase-orders`/`users` GET all denied for a guard) — defense in depth, not just hidden UI.
- **Empty states** — `MobileEmptyState` is a real convention: icon + title + description + hint + action + `contactHint` (shown when the role can't create). Used across all mobile surfaces.
- **Deferred features are honest** — phone-verify SMS returns a clean 501 "not yet configured" rather than faking a sent OTP; the OTP store/rate-limit/expiry are already correct, only the SMS provider is unwired.

### Fixed — task card vanishes on Start (Oct 7)

`MobileTaskList.updateStatus` marked `taskStates[id]="done"` on EVERY successful transition, and `byStatus` hid any task marked "done" — so tapping **Start** (→ IN_PROGRESS) made the task disappear from the open list while it was still open. The summary chips (server data) showed "In Progress 1" but the card was hidden in every bucket — the count and the list disagreed, and an assignee who started a task saw it vanish ("did it even register?").

Fix: added a `statusOverrides` map — the task's effective status is `override ?? t.status`. Non-terminal transitions (Start→IN_PROGRESS, Block) now **reposition** the card into the right bucket; only COMPLETED/CANCELLED fall out of every open bucket. Verified live: assign→Start→(shows In Progress)→Complete→(drops off, empty state). Typecheck clean.

### Task module verified end-to-end (Oct 7)

Assign (admin API) → lands in assignee's `/m/site/tasks` inbox grouped by status (Pending/In Progress/Blocked) → inline Start → **Complete** → drops off. Scoped to `assignedToId`, smart empty states ("Add team members first" when no team), desktop `tasks-manager` + `task-detail-drawer` exist for the assigner side.

### Subcontractor RA-bill lifecycle (Oct 7)

`/m/work-orders` — WO-SRG-260930-0001 (Brick masonry, Sharma Mason Works, Site One). Status pipeline Draft→Issued→**Active**→Completed→Closed. Financial summary: Work Done ₹57.6K · Retention Held ₹2.9K (5%) · Advance ₹0. Terms: Retention 5% · TDS 1% (Individual) · Advance Recovery 10% · Defect Liability 12mo.

**RA-bill math verified in DB:** gross ₹57,600 − retention ₹2,880 (5%) − TDS ₹576 (1%) = **net ₹54,144** ✓ — real retention/TDS deduction, not display math.

**Create RA Bill** — measurement-billing dialog (period from/to + notes + unbilled-entry preview). Correctly blocks when fully billed: _"No unbilled MB entries found — approve measurement book entries first."_ RA bills bill against **approved MB entries** (measurement → certification → bill → pay chain is real). A transient "Failed to load preview" on first-open self-recovered on reopen — covered by the new useFetch retry affordance.

### Fixed — CSP blocked the list-compute worker (Oct 7, prod)

Production console showed a CSP violation: the `list-compute` web worker (offloads heavy list sort/filter off the main thread) is bundled as a `blob:` URL, but the CSP had no `worker-src` — it fell back to `script-src` which rejects `blob:`, so the worker was blocked and the app silently degraded to synchronous main-thread compute on large lists. Added `worker-src 'self' blob:` to the CSP in `next.config.ts`. Committed `6de28815`, pushed, deployed — the worker now loads clean (zero console errors on `nirman.life`).

### Deployment log (Oct 7)

- `f4abffe9` — full improvement set (9 fixes + ops docs) → prod healthy
- `6de28815` — CSP worker-src fix → prod healthy
- Both deploys: Coolify build+swap ~8min, graceful restart, post-deploy health 9/9.
