# Trust Audit — 24 Oct 2026

**Question I was asked:** use Nirman like a real business would, then say whether I'd
trust it and whether it's the best UX in its market.

**Answer in one line:** I would trust the **transactions**, and I would not yet trust the
**dashboards** — every state machine I drove behaved correctly, and every summary screen
quoted a different number for the same fact. For an owner, the summaries _are_ the product.
That gap is fixable in days, not quarters, and it is the only thing standing between this
and a category-defining product.

---

## 1. How this was tested

|                  |                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Method**       | Used the product as four real people would — OWNER, SUPERVISOR, and API-level probes as SUPERVISOR/STORE_KEEPER — on the **production build** (`next start`, not the dev server), desktop 1440×900 and mobile 390×844, dark theme. |
| **Data**         | Seeded `nirman_inventory` — SRG REALCON: 49 projects, 35 live sales, 164 POs, 350 gate passes, 58 employees, 2,266 journal entries, 10,016 audit rows. Realistic density, some script-inserted rows (see F7).                      |
| **Mutations**    | One gate-pass approval (to test the state machine + KPI refresh). Everything else read-only.                                                                                                                                       |
| **Cross-checks** | Every number on screen was re-derived with SQL and the underlying API, so a finding below is "the UI disagrees with the database", not "the UI looked odd".                                                                        |

One environment caveat worth recording as its own finding (F12): the server I first hit was
serving a **stale build** — HTML referenced chunk hashes that no longer existed, two core
chunks returned 500, and the sign-in page rendered **perfectly but was completely inert**
(the Email tab did nothing, Sign in did nothing, no error, no reload). I restarted the
server and everything worked. In a rolling deploy or a cached-HTML window, a real user
would experience exactly that.

---

## 2. The trust test (a business owner's first five minutes)

An owner opens the app and asks three questions: _How much cash do I have? Who owes me?
What do I owe?_ Here is what the product answered — from three surfaces, minutes apart, on
the same database.

| Question    | Today (home) | Assistant ("cash position kya hai")                    | Finance / Sales |
| ----------- | ------------ | ------------------------------------------------------ | --------------- |
| Cash        | **₹6.93 Cr** | ₹6.93 Cr _and_ "Cash/Bank ₹7.65 Cr" in the same answer | —               |
| Receivables | **₹1.33 L**  | **₹54.04 L**                                           | **₹52.35 L**    |
| Payables    | **₹21.38 L** | **₹5.65 L**                                            | —               |
| Net         | **₹6.73 Cr** | **₹8.14 Cr**                                           | —               |

Four answers to "who owes me", spanning 40×. Two answers to "what do I owe". The assistant's
own answer contains two different "Cash/Bank" figures (₹6.93 Cr is account 1000; ₹7.65 Cr is
every 10xx account including RERA escrow and petty cash).

This is not a rounding problem. It is **four independent computations of the same business
fact**, each plausible, none reconciled:

- **Today** reads GL account `1000` / `1200` / `2000` via `trialBalance()`.
- **Assistant** sums every GL account starting `10`, plus an ad-hoc receivable
  (`materialSale` dues + `assetSale` dues) and `Supplier.balanceOwed`.
- **Sales / Finance** use the `saleDues()` helper (TDS-aware) — the best of the three.
- **The polling API** re-derives a fourth set with `.count()` queries.

An owner who spots two of these stops trusting all of them. **This is the #1 thing to fix,
and it is a design problem, not a coding problem:** pick one module that owns
`cashPosition(companyId)`, `receivables(companyId)`, `payables(companyId)` and make every
surface — dashboard, assistant, finance header, mobile pulse, notifications — call it. Where
the bases genuinely differ (ex-GST booked vs gross collected), show the _bridge_ on screen
instead of hiding it in a tooltip.

---

## 3. What is genuinely excellent — protect this

I want to be explicit, because most of this product is better than what Indian builders
actually use today (Tally + WhatsApp + Excel + a site diary).

1. **The state machines are honest.** Approving a gate pass flipped status, wrote the
   approval timeline (name + timestamp), updated "Pending Approval 18 → 17" and
   "Awaiting Exit 39 → 40" in the header, and left the dialog open on the next action. That
   is the "this is a real system" feeling that closes deals.
2. **Stock is architecturally right.** Per-location MAC, immutable movements, "on-hand value
   ₹9.69L" agreeing with the Finance inventory KPI to the rupee. Very few competitors can say
   this.
3. **RBAC and privacy hold up under probe.** SUPERVISOR got 403 on GL, payroll, sales,
   expenses; 200 (empty, scope-filtered) on employees. The employee payload carries no
   PAN/Aadhaar/bank fields. The Finance watermark ("Vardaan Kumar · 24 Oct 2026") plus
   copy-block is a real leak deterrent — owners will screenshot this feature.
4. **It speaks the customer's language.** "Receive stock", "theke-wala", "aane wala /
   dena hai", RERA 10% cap, 194C/194Q, ATS/BBA/registry, gate pass, "chq CHQ-1". Very few
   competitors can say this.
5. **Depth where money is made:** TDS-aware dues, pending-cheque queue as a first-class
   concept ("the money isn't usable yet"), bank-SMS matching, comparative quotes, Tally sync,
   per-line GST + landed cost. This is a real estate builder's ERP, not a generic inventory app.
6. **Craft details:** phone-first sign-in with passkey, ⌘K palette with verbs, print/CSV/Save
   view on every table, weather pre-filled on the DPR, "In 30 days: ₹6.74 Cr" runway that
   actually reconciles its own components (6.85 + 0.075 − 0.122 ≈ 6.74).

---

## 4. Findings

Severity = blast radius on a paying customer. Effort is my estimate for a focused fix.

### P0 — an owner acting on this loses money or trust

**F1. Today's cockpit hides 30 of 54 approvals.**
Today says **"24 things need you, 6 blocking"**. `/api/approvals` says **54** (20 PO, 17 gate
pass, 3 DPR, 1 expense, 1 RA bill, 6 leave, 6 attendance correction). Nothing on the home
screen mentions that 37 purchase orders and gate passes are waiting.

Root cause (precise, one-line): the Today page and `/api/dashboard-counts` filter with
`createdById: { not: userId }`. In Prisma, `not` on a nullable column **excludes NULL**, so
every record with no creator — imported, migrated, system-generated, cron-created — is
invisible. 20 draft POs and 18 gate passes in this DB have `createdById = NULL`. `/api/approvals`
uses `OR: [{ createdById: null }, { createdById: { not: userId } }]`, which is why it disagrees.

_Fix:_ replace the ad-hoc predicates with the existing helpers in `lib/approval-queue.ts`
(`notCreatedBy`, `notSubmittedBy`) everywhere — 25 occurrences across 7 files — and add one
regression test asserting Today = `/api/approvals` = nav badge for a seeded NULL-creator set.
_Effort:_ half a day. **This is the single highest-value fix in the report.**

**F2. The poll silently freezes several queue counts at 5.**
The server renders queues with `take: 5` and `count: rows.length`; 30 seconds later the poll
overwrites counts with real `.count()` values — but only for keys it returns. It returns
`sales-balance` and `stock-count` only; **`pending-cheques`, `overdue-installments` and
`units-sell` are never refreshed**, so "Cheques awaiting clearance **5**" stays 5 forever while
the database holds **24** uncleared cheques (₹ lakhs of provisional money the owner believes
he's cleared). The first paint also shows 5 for everything, so numbers visibly jump on load.

_Fix:_ make the poll return the same key set as the server, and server-render real `.count()`
totals (a `count` per queue is one cheap query — the page already batches 22). _Effort:_ 1 day.

**F3. "Sales awaiting payment" includes a customer who owes nothing, and three surfaces
disagree on how many sales are unpaid.**
Home: 2 sales. Finance banner: "1 sale with pending balance". Sales board: "Overdue 0". The
home list literally shows **"Renu Builders Pvt Ltd — ₹0 balance due"** under _Collect
outstanding balances_ (a sale paid ₹1.70 L against a ₹1.20 L price — overpaid, and still
`paymentStatus = PARTIAL`).

Home filters on `paymentStatus ∈ {PENDING, PARTIAL}` instead of the computed due; the sales
board counts "overdue" as _any item with status DUE_ and ignores `dueDate` **and** ignores
PARTIAL items — so a past-due part-paid installment (the common case) is never "overdue":
`Sale #2, ₹75K, 2 days late` on Today; `Overdue 0` on Sales.

_Fix:_ one `saleDues()`-based filter: `due > 0` for the collect queue, `dueDate < today &&
unpaid` for overdue; add a nightly repair for stale `paymentStatus`. _Effort:_ half a day.

**F4. The headline margin is 91.2%, which no builder will believe.**
Today and Finance both lead with **Revenue ₹9.11 Cr − Cost ₹80.00 L = ₹8.31 Cr, 91.2% gross
margin**. Construction runs 12–25%. The caption ("cost is recognised as work happens") is
honest but it is a footnote under a headline that reads as fiction — and it undermines the
credibility of the cash figures right next to it. Only 1 of 49 projects has any cost booked,
and the Finance header says costs ₹79.34 L while the P&L row says ₹80.00 L.

_Fix:_ never show a margin for a project whose cost basis is incomplete — show "cost basis
incomplete (2 of 7 cost heads posted)" and rank by _revenue recognised_ until coverage crosses
a threshold. Ensure one cost total. _Effort:_ 1 day.

### P1 — a real user hits this in week one

**F5. The freshly-approvable PO shows arithmetic that cannot be true: 5 × ₹100 = ₹0.**
`/approvals` lists 20 POs, 19 of them **₹0**. The detail page shows a line "5 kg × ₹100" with
**Line total ₹0, Subtotal ₹0, GST ₹0, Total ₹0**. (Also: "Waiting on: Project Director /
Procurement Manager" is shown to the OWNER who can approve it — the value-tier hint ignores who
is looking.)

These rows were script-inserted, so this is not a create-path bug — it is a **missing
invariant**. Any Tally/Excel migration or a partial failure produces exactly this, and the
consequence is a control bypass: approval tiers key off `total`, so a ₹5 L order that says ₹0
routes to the lowest approver. _Fix:_ derive line total from qty × rate when the stored total
disagrees, refuse to approve a PO whose total is 0 while its lines aren't, and label "Waiting
on" relative to the viewer's rank. _Effort:_ 1 day.

**F6. A gate pass with no items, no vehicle and no destination can be approved.**
I approved `GP-VFY-13038` (Manual, 0 items, transport all "—"). It went straight to Approved
and counted toward "Awaiting Exit". An empty ITEMS table also renders as a bare header with no
empty-state text. For the one control that governs material leaving a site, this is a hole:
require ≥1 line for material issues, require a purpose/description for manuals, and say
"This gate pass has no items" instead of showing nothing. _Effort:_ half a day.

**F7. The field user's first day is a dead end.**
Signed in as **Ravi (SUPERVISOR)**, mobile 390px:

- "No employee record linked to your account — attendance and DPR steps will appear once HR links one."
- Attendance screen: "No workers yet — Add workers in the HR module" (the API returns 0 rows for
  his scope; 7 employees exist for the company).
- DPR screen: a warning banner says the day is in a **locked payroll period and the DPR will be
  rejected**, and then invites him to fill the entire form — project, work type, quantity,
  summary — a guaranteed-lost two minutes. The attendance screen, by contrast, correctly
  disables itself with "Locked — payroll paid". Same rule, two behaviours.

The product knows site work deeply, but a supervisor cannot check in on day one, and when a
period is locked the UI asks him to do work it will throw away. _Fix:_ (a) make the user→employee
link a first-run task with an admin notification, (b) allow self-service "I'm on site X"
attendance for unlinked users, (c) make DPR obey the lock exactly like attendance — disable, and
offer "submit as next-period adjustment". _Effort:_ 2 days.

**F8. Notifications deep-link desktop users into the mobile app.**
**11,375 of 11,382** `InAppNotification` rows carry a `/m/...` link (the other 7 are null);
zero carry a desktop path. A desktop owner clicking "Claim submitted" lands in the phone
layout. The bell also showed **53–58 unread** — a single flat count with no triage.
_Fix:_ store surface-agnostic links and resolve them per surface; cap/group the badge; add
"mark all read". _Effort:_ half a day.

**F9. Four date formats on one screen, and one is ambiguous for Indians.**
`Oct 24, 2026` (lists) · `24/10/2026` (date inputs) · `2026-10-24` (DPR warning) ·
`10/23/2026, 9:57:23 PM` (gate-pass timeline) · `10/2026` (payroll period). `10/23/2026` in an
India-first product will be misread. Dates in the DPR table wrap to three lines
("Oct / 24, / 2026"), which breaks scanning a date-sorted list. _Fix:_ one formatter
(dd MMM yyyy for tables, dd/MM/yyyy for inputs, no seconds), and `whitespace-nowrap` on date cells.
_Effort:_ 1 day, wide but mechanical.

**F10. Mobile chrome covers the content it's asking you to fill.**
On 390×844 the assistant bubble, the feedback bubble and the `+` FAB sit on top of form
controls: the "Add" button for _Materials used_ is half-covered, _Labour utilised_ and _Notes_
are behind the FAB, and "Nothing to visit" in _Incoming deliveries_ is unreadable. The DPR lock
banner is also truncated to "DPR locked — 10/2026 payroll p…" on the Field screen — the one
sentence that explains the block is cut off. _Fix:_ reserve bottom padding on scroll containers
and hide floating actions while a form is focused. _Effort:_ 1 day.

### P2 — polish that separates "good" from "best in market"

**F11. The low-stock promise is only 4 materials wide.** "LOW STOCK 0 — 4 in stock · all good"
sits next to a ₹9.69 L inventory, but SRG has 7 materials and only **4 have a reorder point**;
the rest have no monitoring at all. "All good" is true only for what you're watching. Show
"4 of 7 monitored" and surface "3 materials without a reorder point" as a setup nudge.

**F12. A stale build renders a perfect, inert page.** (See §1.) Chunk load failures returned
500/MIME-refused, `<ChunkErrorRecovery>` did not intervene, and the sign-in form silently
stopped working. Add a boot check: if a critical chunk fails, show "This page is out of date —
reload" instead of a dead form.

**F13. "₹1.2L" in the top bar is a settings toggle.** It reads as data; its aria-label reveals
it's the compact/detailed currency switch. Nobody will click a number to change formatting.
Move it to Settings or use an icon with a visible label.

**F14. A DPR with no budget prints "3,888% of budget · ₹0/sqft".** Divide-by-zero displays as
an alarming multiple. Show "no budget set" and link to set one.

**F15. Navigation/IA: DPR lives under People → HR, and `/dprs` 404s.** Daily progress reports
(hidden under HR), gate passes (under Build → Stock) and procurement (under Build → Procure)
are filed by module, not by the job a person is doing. A site engineer looking for "DPR" will
not think "HR". Add `/dprs` as a redirect, and surface DPR + gate pass from the Build world.

**F16. ⌘K finds destinations, not records or the actions people do most.** Typing "payment"
returns three _pages_; there is no "Record payment" action and no customer/PO/document hit.
`/api/search` does return entities (only when the term matches a name/number) and returns
`/m/...` hrefs unless `surface=desktop`. Also: the palette's last row is clipped behind the
footer at 900px height. Add the top 10 verbs (Record payment, Receive goods, Issue material,
Mark attendance, Submit DPR, Add expense, New lead, New PO), section headers, and fix the height.

**F17. Repetition without distinguishing data.** Three identical "Apex Center Site Store —
Awaiting reconciliation" rows in _Stock inventories to process_, and 4 identical "wf task" rows
in _My Tasks_. When rows look identical, show the differentiator (count no., date, variance,
project) — otherwise the queue is unactionable.

**F18. Screen-reader seams.** The greeting is separate text nodes: a reader hears
"Good afternoon, Vardaan.24things need you." Also `Fixed` units, `+13 more` and the notification
badge have no accessible names. Cheap to fix, and enterprise buyers ask.

---

## 5. Do we know our users?

**Yes — remarkably well. That is this product's real moat.** The vocabulary is right
(theke-wala, aane wala, gate pass, chalan, BBA/ATS/registry), the compliance is right (RERA 10%
pre-sale cap, 194C/194Q TDS, e-invoice/IRN), the money model is right (deposit-as-liability,
TDS withheld by buyers, cheque-as-uncleared-money), and the field UI is built for a thumb
(3×3 action grid, GPS capture, offline queue, Hinglish assistant with voice).

**The gap is not knowledge of the business — it is the first ten minutes of a specific person.**
Four personas, four unfinished doorways:

| Persona               | What the product already nails                 | Where they get stuck                                                      |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| **Owner (Vardaan)**   | Cockpit, cash, P&L, approvals, watermark       | 30 of 54 approvals invisible; four different cash answers; 91% margin     |
| **Supervisor (Ravi)** | Field grid, gate pass, DPR, GPS, attendance    | No employee record → no attendance, no workers, DPR locked-but-fillable   |
| **Accountant**        | GL, Tally, GST/TDS, cheque queue, bank SMS     | Approvals screen shows ₹0 POs; no single dues figure to reconcile against |
| **Store keeper**      | Per-location MAC, count/adjust, GRN, low stock | Low-stock watch covers 4 of 7 materials; no company-wide material total   |

A useful framing for the roadmap: **"Everyone can do the work; nobody can yet trust the
summary."** The next release should be about _agreement between screens_, not new modules.

---

## 6. What I would do next, in order

1. **One source of truth for money** — `cashPosition` / `receivables` / `payables` in
   `@nirman/services`, consumed by Today, Finance, Assistant, mobile pulse, notifications.
   Accept the answer that the numbers will move (they must) and show the bridge where bases differ.
2. **One source of truth for "needs you"** — the approval-actionable helper drives Today, the
   poll, the nav badge and `/approvals`; fix the NULL-creator predicate in all 25 places; add the
   regression test that compares all four surfaces.
3. **Never show a number you can't defend** — no margin without cost coverage, no "all good"
   without coverage, no "0% of budget", no 5-item cap presented as a total.
4. **Finish the field persona's first day** — employee link, self-service attendance, lock
   handling consistent across attendance and DPR.
5. **Then** the polish pass: date formats, mobile chrome collisions, palette verbs, notification
   links, empty states that explain instead of vanish.

If you do 1–3, an owner stops double-checking you in Excel. That is the moment the product
becomes referable, and referral is how this market is won.

---

## Appendix — measured values (24 Oct 2026, SRG REALCON)

```
Today            : 24 things need you · 6 blocking
/api/approvals   : 54   (PO 20 · gate pass 17 · DPR 3 · expense 1 · RA bill 1 · leave 6 · correction 6)
/api/dashboard-counts : totalQueues 18 · blocking 0 · keys [sales-balance 2, stock-count 16]

Today cash card  : Cash 6.93Cr · AR 1.33L · AP 21.38L · Inventory 9.69L · Net 6.73Cr
Assistant        : Cash 6.93Cr · Petty 1.05L · RERA 70.75L · "Net" Cash 7.65Cr · Recv 54.04L · Pay 5.65L · Net 8.14Cr
Finance banner   : 52.35L outstanding · "1 sale with pending balance"
Sales board      : Booked 12.41Cr · Collected 11.81Cr · Outstanding 52.35L · Overdue 0 · BBA done 0
Today sales queue: 2 sales · Sparsh 52.35L · Renu Builders ₹0

DB cross-check   : pending cheques 24 (UI shows 5) · gate passes pending 18 · draft POs 20 (19 at ₹0)
                   materials 7 (4 with reorder point) · built units 63 (61 soft-deleted) · employees 58 (7 in company)
```
