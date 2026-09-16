# Audit & Handover Ledger — SRG REALCON

> A consolidated record of the multi-pass refinement audit — what was verified
> end-to-end, what was fixed, and the design decisions that are intentional
> (not gaps). For module coverage context, see `DECISIONS.md`.

**Last audit:** Sep 2026 · **State:** all gates green — `pnpm --filter @nirman/services test` (1557), web unit tests (1581), `tsc --noEmit` clean, `pnpm build` clean.

---

## How each surface was verified

Every business flow was run **end-to-end as a real signed-in user** (not just
code review) and confirmed at the database/GL layer — a submitted record lands
in the DB, its stock movement posts, and the journal entry balances.

Personas exercised live: **SITE_ENGINEER** (field), **FINANCE_HEAD** (accounts),
**OWNER** (desktop dashboard). Others verified via nav-manifest + role tests.

---

## Coverage map — verified working

| Area                 | Verified                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Procurement**      | Indent → approve → quotes (gate) → convert → PO → receive (GRN + stock + PO line) → supplier return. Over-delivery guarded (`cumulative > ordered` → throw, serializable tx). |
| **Inventory**        | Issue / transfer / count → variance → adjustment; per-location availability shown before picking; low-stock → "Raise indent" prefill; balanced stock ledger + MAC.            |
| **HR**               | GPS check-in (geofence, supervisor fallback), 5-code attendance, leave (balance + approved-leave cancel reverts attendance), payroll run → payslip.                           |
| **Finance**          | Expense claim → approve → pay; RA bill → pay; supplier payment → invoice reconcile; **GL trial balance balances (Dr = Cr)**; Tally sync push.                                 |
| **Sales / CRM**      | Lead → activity → stage → convert; sale booking → demand notice → payment → receipt; gate-pass execution decrements stock.                                                    |
| **Quality / Safety** | NCR → investigate → CAPA → close; safety incident → investigate → close.                                                                                                      |
| **Approvals**        | Badge counts only actionable items; value-based routing; self-approval blocked except tier-1; aging cron escalates >48h stalls.                                               |
| **Offline**          | Queue company-scoped, retry-capped (5) + manual retry, payload summary, clears on sign-out, 401 wipes local data.                                                             |
| **Concurrency**      | Optimistic locking on materials/customers/suppliers (version → 409); serializable transactions on financial writes.                                                           |
| **Notifications**    | Role + project-scope + self-exclusion routing; in-app instant + opt-in WhatsApp/Email via cron; deep-links resolve.                                                           |
| **Delegation**       | Out-of-office authority handoff — same-company, no loops, 90-day cap, `onBehalfOf` audited.                                                                                   |
| **Error triage**     | Fingerprinted ErrorLog, regression auto-reopen, DEVELOPER-notify → `/dev/errors` + `/m/dev/errors` (dev-gated).                                                               |
| **Print**            | PO letterhead, GRN delivery challan, sale receipts — in-app overlay, no desktop redirect.                                                                                     |
| **PWA**              | Installable manifest, standalone, maskable icons, lands on `/m/home`.                                                                                                         |

---

## Design decisions that are intentional (NOT bugs)

- **Self-check-in requires GPS** — anti-fraud control; supervisor-marked
  attendance is the documented fallback when GPS fails.
- **Project-scoped users 404 on out-of-scope records** — a site engineer can't
  open a company-store GRN; `scopeWhere` filters correctly. Don't "fix" by widening.
- **Audit trail is owner/admin/PD only** — accountability surface, not broad.
- **External notifications are opt-in** — WhatsApp/Email off by default so they
  don't spam; the in-app bell is always on.
- **`Restrict` onDelete on referenced entities** — you can't hard-delete a
  material/location/supplier that has movements; use soft-delete (`deletedAt`).
- **`?desktop=1`** is a user-invoked escape hatch only — no automatic
  mobile→desktop redirect. Mobile is a complete field surface.

## Known limitations (documented, non-blocking)

- **Leave balance has no ledger** — balances are derived; there's no append-only
  balance-movement log. Cancel-reverts-attendance is handled correctly.
- **HSN granularity** — per-line HSN codes where a category default applies are
  coarse. Auto-fetch provider is wired (`/api/hsn-gst`).

---

## Production deploy notes

- Deploy via `./scripts/deploy-prod.sh` (Coolify API + health wait). Health: `/api/health`.
- Production build uses **webpack** (`pnpm build`) — not Turbopack (Prisma module-factory bug).
- `pnpm --filter web start:wrapped` runs the auto-recovery wrapper (crash restart, health poll, RSS monitor).
- **Start production from a clean SRG seed** — the local DB is full of `E2E-SRG-*`
  test records; do NOT carry them to `nirman.life`. Provision the company + real
  team via `/api/auth/bootstrap` or the seed, not the test fixtures.
- Schema changes must ship a migration (`pnpm --filter @nirman/db migrate:dev --name <desc>`).
- Cron routes (`/api/cron/*`) need `CRON_SECRET` set in prod.
- Credentials live in gitignored `.env.prod-secrets`.
