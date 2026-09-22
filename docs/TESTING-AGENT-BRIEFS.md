# Testing Agent Briefs — Parallel Deep-Audit Playbook

> **Purpose**: one file to split the end-to-end "refine the whole application"
> audit across multiple agents without collisions. Each agent pastes the
> **Shared preamble** + their **module brief** into their session, claims a
> module, works, and reports in the standard format.

---

## How to use this file

1. The human (or orchestrator) gives each new agent: the **Shared preamble**,
   one **Module brief** below, and the **Coordination protocol**.
2. Each agent claims exactly ONE module letter (A–H). Before starting, they
   append their claim to the claim ledger at the bottom of this file.
3. Agents commit on their own branch `test/<module-letter>-<name>` and report
   findings in the standard format. Never push directly to `main`.

---

## Shared preamble (paste into EVERY agent session)

```
You are auditing "Nirman Inventory OS" — a construction-industry ERP at
/Users/sparshagarwal/Downloads/nirman-inventory (pnpm monorepo: apps/web +
packages/{db,services}). Local dev runs at http://localhost:3000 with an
auto-recovery wrapper (pnpm dev). Read AGENTS.md + DECISIONS.md first.

YOUR JOB IS NOT to check that pages render. Your job is to break flows.
Every claim of "works" requires an end-to-end proof:

- Drive the REAL UI (Playwright/browser) on BOTH surfaces:
  desktop (1280px+) and mobile (390x844, routes under /m/*).
  Mobile controls are custom pickers/bottom-sheets, not native <select>.
- Execute FULL chains, not single steps: e.g. don't just open a PO —
  create indent → approve → quote → PO → GRN → partial receipt →
  check stock landed at the location → issue it → verify the ledger.
- After EVERY mutation: reload, navigate away and back, and verify it
  persisted. Check the audit trail / activity feed reflects it.
- Check the BROWSER CONSOLE on every page — report every error/warning,
  even on pages that "look fine".
- Test the DENIED path, not just the allowed one: for every surface your
  test user can reach, find one they shouldn't and confirm it's blocked
  (page gate AND the API — fetch() the mutation endpoint directly, expect
  401/403, never 500 or silent success).
- Numbers must reconcile: totals, balances, GL debit=credit, stock in/out.
- Watch for data-hygiene bugs: raw "@nirman.internal" emails shown to
  humans, empty states that are broken vs honest-empty, missing geofences,
  404 links, buttons that render but do nothing, dialogs that don't open.
- Permissions are fail-closed. A missing permission must produce a denial,
  not a crash or a silent no-op.

GROUND RULES:
- Work ONLY inside your module's routes/files. Shared infra files
  (apps/web/src/lib/server.ts, lib/roles.ts, schema.prisma, the auth layer,
  middleware) are read-only for you — flag issues in them, don't fix.
- Do NOT run migrations, do NOT delete data, do NOT push to main, do NOT
  deploy. Commit locally on your branch only.
- Do NOT create accounts/members that overlap other agents' test users —
  use your tag (below) as the email/name prefix for everything you create.
- If the dev server is down, restart it (pnpm dev) — don't assume a bug.
- Before fixing anything, reproduce it once more. Fix root cause, not the
  symptom. Every fix gets a test or a verified UI repro.

REPORT FORMAT — when done (or blocked), output:
  MODULE: <letter>
  CHAINS VERIFIED: <numbered list, each with the full chain + result>
  BUGS FOUND+FIXED: <each: what, root cause, files, commit hash>
  BUGS FOUND+OPEN: <each: what, where, severity, suggested owner>
  GAPS (missing functionality, not bugs): <list>
  VERIFICATION: <typecheck/lint/tests status>
```

---

## Module briefs (paste ONE per agent)

### AGENT A — Procurement → Inventory → Stock lifecycle

```
TAG: [A] — prefix all test records with "A-" (e.g. material "A-TestSteel",
supplier "A-Vendor", PO comments tagged).
SCOPE: /procurement, /inventory, /stock, /requisitions, /suppliers,
/m/procurement, /m/stock-*, /m/material-issues, and their APIs.

CHAINS TO PROVE:
1. Indent → quote comparison (anomaly flags) → PO → GRN (partial + full) →
   stock lands at the right location → available qty correct.
2. Issue → gate pass → exit → stock decremented → cancel issue → stock +
   GL both reversed (verify the reversal, not just the status flip).
3. Transfer dispatch → in-transit → receive → both locations' qty correct.
   Then cancel + return-to-source variants.
4. Scrap + stock-count (variance → adjustment) paths.
5. Supplier cockpit: POs, rate contracts, receipts, returns, invoices,
   payments, fulfilment %, amount owed.
6. Requisition → PO conversion. Material price history / last-purchase.

EDGE: a STORE_KEEPER-scoped user — verify they only see their project/
location's stock and can't act on another location's. Try a stock.issue-only
custom role reaching the pick-lists.
```

### AGENT B — Finance, payroll & compliance

```
TAG: [B]
SCOPE: /finance/*, /accounts, /payroll, GL, payables, petty cash, claims,
advances, budgets, recurring, GST report, TDS, e-invoice, audit log.

CHAINS TO PROVE:
1. GL always balances (Σdebit = Σcredit) after EVERY posting type: PO
   accrual, GRN, issue reversal, sale, payment, payroll, advance.
2. Salary advance → monthly recovery → payroll deduction → GL. (The
   EmployeeAdvance scope fix just landed — verify scoped viewers can't see
   other projects'/departments' advances and H1 walls hold.)
3. Payroll run → lock → attendance-lock enforcement → payslip → payment.
4. GST report math (output GST, ITC, net), TDS certificates, e-invoice IRN.
5. Petty cash: allocate → spend → reconcile → replenish.
6. Claims lifecycle + recurring expenses + budgets vs actuals.

EDGE: FINANCE_HEAD vs ACCOUNTANT vs a non-finance role — /finance must
deny the latter at page AND API. Check money formatting (₹ lakh/crore
compact) everywhere it renders.
```

### AGENT C — HR, attendance & field workforce

```
TAG: [C]
SCOPE: /hr/*, /m/hr/*, /m/attendance, employees, onboarding, leaves,
documents, agreements, ID cards, hierarchy/org tree, offsite attendance.

CHAINS TO PROVE:
1. Hire → onboard → agreement → ID card → active → salary history →
   terminate → restore (verify each transition persists + audit trail).
2. GPS attendance: in-geofence check-in, out-of-geofence check-in → HR
   review/override, check-out, site assignment, missing-geofence sites.
3. Multi-role: create account with primary + secondary roles → sign in →
   switch hats in the header → permissions change with the active hat →
   switch back. Verify no privilege union-leak.
4. Leave: apply → approve/reject → balance → payroll impact.
5. DPR: submit → two-tier approve → verify it posts to project cost.
6. Employee field visibility: verify gov-IDs/bank/wages never leak to
   non-HR viewers (hr.view vs hr.manage surfaces).

EDGE: a member with NO employee record vs an employee with NO login.
Cross-tenant: switch company → the other company's employees invisible.
```

### AGENT D — Sales, land & customer portal

```
TAG: [D]
SCOPE: /sales, /leads, /units, /customers, parcels, bookings, collections,
registry (IRN/TDS/ATS/BBA), brokers, /portal/* (customer OTP surface).

CHAINS TO PROVE:
1. Lead → follow-ups → convert → unit hold → booking → payment schedule →
   collection (receipt → GL) → registry milestones.
2. Unit status machine: available → hold → booked → sold; release a hold.
3. Material sale → margin + GST + UTR → GL. Asset sale → IRN/TDS/ATS/BBA.
4. Parcel → subdivision → valuation → booking against a parcel.
5. Broker attach → commission → payout.
6. Customer portal: OTP login → customer sees ONLY their bookings/
   payments/documents — try another customer's id → must 403/404.

EDGE: sales.view vs sales.manage boundary (view sees pipeline, can't
create). Deposit-as-liability accounting correctness.
```

### AGENT E — Construction ops: WO → MB → RA → NCR → safety → EVM

```
TAG: [E]
SCOPE: /construction, /work-orders, measurement book, RA bills, NCR,
safety (incidents/hazards/inspections), WBS, BOQ, /cost-control (EVM),
subcontractors.

CHAINS TO PROVE:
1. BOQ/WBS → work order → MB entry → verify → approve → RA bill →
   retention/deduction waterfall → approve → GL + totalWorkDone updates.
   (Note: totalWorkDone only moves on APPROVE — verify, don't "fix" it.)
2. NCR: raise → disposition → rework → close.
3. Safety: incident → investigate → close; hazard; inspection schedule →
   conduct → findings → actions.
4. EVM: PV/EV/AC/CV/SPI/CPI/EAC math on a project with real transactions.
5. Subcontractor → WO link → bill → pay.

EDGE: RA bill approval by the wrong role must fail. MB edit after approve
must fail. NCR/safety notifications reach the right roles.
```

### AGENT F — RBAC, tenancy & admin surfaces (the deep one)

```
TAG: [F]
SCOPE: settings/* (members, roles, custom roles, permissions, policy,
phone pool, integrations, audit, project-assignments, export, backup),
delegation, active-role switching, company switching, scope enforcement.
This is the highest-risk module — be exhaustive.

CHAINS TO PROVE:
1. Custom roles: create (scratch AND inherit-mode) → assign via mobile AND
   desktop → log in as the holder → verify each granted surface works and
   each withheld surface denies (page + API). Try weird mixes: HR-only +
   gate_pass.exit; finance.view + stock.issue; a single-perm role.
2. Multi-role: primary + secondaries → active-hat switch → perms change →
   scope does NOT widen on hat switch → switch back. Try switching to a
   hat then performing a mutation the other hat couldn't.
3. Scope: COMPANY / DEPARTMENT / PROJECT on a member → their lists show
   exactly the scoped rows. Scope entries required + validated. A
   scoped-down user can't fetch out-of-scope ids via direct API.
4. Delegation: delegate → delegatee approves on delegator's behalf →
   expiry auto-revokes → two-way loop rejected → tier-floor enforced
   (field-tier delegate rejected).
5. Tenant isolation: switch company → zero cross-company data in any list,
   search, or direct id fetch. Try every "id" param.
6. Reset-password / deactivate / reactivate member flows, incl. tier
   checks (can't reset someone above your tier).

KNOWN-OPEN ITEM (do not re-report): no member-management UI edits
secondaryRoles post-creation — only the create-account dialog sets them.
If you hit it, note as KNOWN.

EDGE: try assigning DEVELOPER — must be impossible everywhere (picker,
API, secondary, custom baseRole). Try last-OWNER demote — must fail.
```

### AGENT G — Mobile-only field surface & offline

```
TAG: [G]
SCOPE: everything under /m/* at 390x844 — home, site, stock-out/in,
issues, transfers, gate-pass, attendance, DPR submit, tasks, queue,
offline, telephony dialer, print previews, the nav shell itself.

CHAINS TO PROVE:
1. The mobile nav adapts per role (an owner sees more than a field user —
   verify with 2+ different logins).
2. Every /m/* form: pickers populate, validation fires, submit persists,
   offline queue captures when offline and syncs when back.
3. Gate-pass lifecycle fully on mobile (create→approve→exit→reject).
4. DPR submit on mobile → visible in desktop approval queue.
5. /m/queue offline actions + conflict handling.
6. Print previews (/m/print/*) render bare + correctly.
7. Tab-switcher, deep-linking into /m/* detail routes, back-navigation.

EDGE: rotate to desktop mid-flow (the surface-adapter redirect must land
on a real desktop route, not 404). Verify every mobile lifecycle action
has a desktop equivalent — list any that don't.
```

### AGENT H — Cross-cutting: workflows, notifications, search, exports

```
TAG: [H]
SCOPE: /workflows (React Flow canvas), /notifications, notification
preferences + channels, global search/command palette, all export +
import surfaces, /reports/* (all 19), audit log, SMS→payment parser,
feedback inbox, assistant/AI surfaces.

CHAINS TO PROVE:
1. Workflow: template → create → trigger → runs → notifications fire →
   run history. Branching conditions.
2. Notification preferences: toggle channels/events → persist → reload.
   The prefs envelope is {preferences, channels} — verify no bare-array
   assumptions remain anywhere.
3. Every report renders real data + exports (CSV/PDF) correctly.
4. Global search finds entities across modules, respects permission
   filtering (a user can't search-for/see out-of-perm records).
5. SMS parser → match/create payment → GL.
6. Audit log captures every mutation with field diffs.

EDGE: bulk actions across pages (approve 20 items), pagination boundaries,
timezone edge cases on date filters.
```

---

## Coordination protocol

**Claiming**: before starting, append your claim to the ledger below (one
line). If a module is claimed, take the next free letter or ask the human.

**Shared infra**: `server.ts`, `roles.ts`, `schema.prisma`, auth,
middleware, `scopeWhere` are shared. If two agents need the same shared
fix, the FIRST to land it wins — the other rebases and verifies the fix
covers their case before duplicating work.

**Test data isolation**: prefix every created record with your tag
(`[A]-`, `[B]-`, ...). Never touch records tagged by another agent. Shared
seed data (JSW Steel, Hillview, Greenfield, existing members) is read-only
— reference it, don't mutate it.

**Test users**: each agent creates their own members/employees with their
tag. Never reset another agent's test user's password.

**Git**: `git checkout -b test/<letter>-<slug>` from latest main. Commit
early/often with the module letter in the message (`fix(A): ...`). Rebase
on main before reporting. If you hit a merge conflict in a shared file,
STOP and report it — don't guess.

**Findings file**: append bugs you can't fix to `docs/TESTING-FINDINGS.md`
(create if absent) in the format: `| module | severity | file | summary |`.
Also return them in your report so the orchestrator can reassign.

**Escalate, don't hack**: permission walls, security, data-loss risk, or
architectural disagreements → report as OPEN with severity + evidence,
don't ship a workaround.

---

## Claim ledger (agents append one line)

| Module | Agent/session | Branch | Started | Status |
| ------ | ------------- | ------ | ------- | ------ |
| A      |               |        |         |        |
| B      |               |        |         |        |
| C      |               |        |         |        |
| D      |               |        |         |        |
| E      |               |        |         |        |
| F      |               |        |         |        |
| G      |               |        |         |        |
| H      |               |        |         |        |
