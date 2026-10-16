# Handoff — Continue the Hardening Sweep

You're continuing a multi-round business-logic hardening of Nirman Inventory OS.
The goal: every page/button/API/DB path must hold money, stock, and accounting
invariants so the app is production-deployable once the VPS arrives.

**Read `DECISIONS.md` first** — it indexes every shipped hardening decision
(§1–§50) so you don't re-flag closed work.

## Session state (as of commit `1895ba65`)

- App at `http://localhost:3000` (dev wrapper auto-recovers Turbopack)
- **1,751 unit tests green · 390 chain asserts green · typecheck clean**
- All commits pushed to `main`
- Session cookie: `/tmp/nirman-cookies.txt` (re-auth via `/api/auth/demo-login` if expired)
- DBs: `postgresql://postgres@localhost/nirman_inventory` + `_test`

## How to keep going — do NOT stop after one find

Probe a class → read the service → add the guard → verify live → commit →
probe the next class. The user expects long unbroken runs.

**Probe generators** (each is a real money-leak class):

1. **Every `export async function` in `packages/services/src/`** — check the
   state machine allows only legal transitions, qty/amount caps bind, and
   reversals are symmetric. Files already swept: issue, requisition,
   material-sale, sale, sale-payment, supplier-payment, subcontractor,
   transfer, stock-count, hr, leave, expense-claim, land, soft-delete,
   gl-posting, project-cost, equipment, tenancy. Still lightly probed:
   `procurement-advanced.ts` (approvals routing, commitments), `renovation.ts`,
   `auto-requisition.ts`, `change-order.ts`, `e-invoice.ts`, `sms-parser.ts`,
   `direct-purchase.ts`, `gate-pass.ts`, `vehicle.ts`.
2. **Every DELETE/PATCH route** in `apps/web/src/app/api/` — does it check
   company + scope + state + references before mutating?
3. **Every `balanceOwed`/`totalPaid`/`qtyIssued` accumulator** — can an edit
   path desync it from its GL/ledger source?
4. **Every schema `Decimal` field that money flows through** — is the write
   always inside `withSerializableTransaction`/`withStockTransaction`?
5. **UI dead-ends** — pickers showing exhausted/unusable options; buttons that
   submit payloads the backend will refuse (fix: filter + show remaining);
   status badges that don't exist (BOUNCED/VOID now render — check other
   enums for the same blind spot).

## Guard conventions to follow

- Serializable tx for money/lifecycle; `withStockTransaction` for inventory
- `Decimal` arithmetic everywhere — never `===` on numbers
- Refuse with `ServiceError(msg, status)` — clear message naming recovery
- Add a `qtyIssued`-style tracked column rather than deriving from lookups
- Audit-log every consequential action via `logAction`
- Schema+service both validate — services are the invariant boundary
- Update `DECISIONS.md` (next § number) with each shipped finding

## Verify after every change

```bash
pnpm --filter @nirman/services exec vitest run <touched-files>
pnpm --filter @nirman/services exec tsc --noEmit   # clean
# live probe via curl + /tmp/nirman-cookies.txt
# periodic full suite:
BASE=http://localhost:3000 bash scripts/verify-all-chains.sh   # expect 390+
pnpm --filter @nirman/services test                          # expect 1751+
```

## Recently shipped (don't re-find)

- JE double-reversal guard via `reversalOfId` (§49)
- Cheque-no dedup on material+asset sales; check-out<check-in refused;
  negative countedQty refused (§unnumbered — in `git log`)
- Requisition picker hides exhausted indents + shows `N of M left`
- Material/location/project/employee delete guards (stock + ledger history)
- Frozen cost pools: ON_HOLD/COMPLETED refuse expense claims, manual costs,
  work orders, requisitions, land purchases (§48)
- Supplier-invoice void + arithmetic guards + duplicate-PO PPV baseline
- Material-sale cheque lifecycle (clear/bounce/void) + credit-apply
- Requisition `qtyIssued` ceiling on both issue paths
- BOUNCED excluded from paid sums; GSTR-1 zero-GST/return legs

## Externals blocking (tell the user, don't block on them)

- `pnpm dev` holds `.next` — full Playwright e2e needs it stopped
  (`pnpm --filter web e2e` spawns its own :3100 server)
- VPS `82.41.67.34` not purchased — deploy + prod-DB repairs staged
- Payroll chains skip (all months PAID-locked) — rerun next calendar month

## If genuinely nothing found

Run the e2e suite (stop dev first), or do a browser sweep of every page in
the sitemap via Playwright MCP looking for: empty mains, missing fields,
status badges that render as raw text, buttons that error, dialogs that
post payloads the API refuses. The last sweeps found the Issues-tab dialog
was a different component than the one being edited — always confirm the
rendered component by snapshot, not by filename.
