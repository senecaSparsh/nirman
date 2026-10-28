# Tooling Strategy — Getting the Most From the GitHub-Derived Skills

> Routing: `DECISIONS.md` ranks _what_ to work on; this doc says _which tool runs
> when_. The skills aren't a grab-bag — they form one pipeline:
> **find → specify → verify → polish → adopt → compound.**

## The pipeline, mapped

| Stage        | Skill(s)                                                                                | Job in Nirman                                                                                                                                                                                                     | Status                             |
| ------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Find**     | `ux-audit`                                                                              | Live walkthrough as a real user — proof of interaction before any verdict. The running sweep.                                                                                                                     | ACTIVE                             |
|              | `ux-walkthrough-audit`                                                                  | Static state-machine scan — dead states, unreachable actions, entry-state combos, pre-hydration flashes. Catches the doomed-Reject / dead-BLOCKED / APPROVED-PO-dead-end class _without_ needing seeded data.     | **IDLE — run next**                |
|              | `ux-workflow-check`                                                                     | "What does the real user need that nobody wrote down" — run per persona (`.jez/audit-personas/site-supervisor.md` exists).                                                                                        | IDLE                               |
|              | `responsiveness-check`                                                                  | Breakpoint sweep (320/375/768/1024/1440) on top-10 mobile + desktop pages.                                                                                                                                        | IDLE                               |
| **Specify**  | `speckit-specify → clarify → plan → tasks → checklist → implement → analyze → converge` | Elephant–Goldfish formalized: spec written with full context (elephant), then `analyze`/`checklist` reviewers stress it cold (goldfish). Mandatory for every Tier-3 genuine new build — no more free-form builds. | IDLE — first use on next new build |
| **Verify**   | `wayfinder` + `gauntlet`                                                                | Claim-verification loop: feed every DECISIONS.md line that says "verified live" through gauntlet (read→verify→re-read→verify). Catches claims that rotted.                                                        | **IDLE — schedule**                |
| **Polish**   | `design-review`                                                                         | Per-surface visual pass after each fix round — not ad-hoc.                                                                                                                                                        | PARTIAL                            |
|              | `apple-design` + `emil-design-eng`                                                      | Motion/sheets/dialogs — mobile sheets are exactly this domain (interruptible, velocity-aware). Consult when touching `dialog.tsx`/sheet motion.                                                                   | IDLE                               |
|              | `dimensional-drawing`                                                                   | Spec sheets for `mobile/v2` primitives so new pages can't drift — the customer/lead pages drifted because no spec sheet existed for the detail-page pattern.                                                      | PARTIAL (1 artifact)               |
|              | `anatomy`                                                                               | Docs/marketing figures only — lowest priority.                                                                                                                                                                    | IDLE                               |
| **Adopt**    | `onboarding-ux`                                                                         | First-run + empty-state audit — the "uneducated user" mandate.                                                                                                                                                    | **IDLE — pre-launch**              |
| **Compare**  | `ux-extract` → `ux-compare`                                                             | Extract patterns from 1–2 reference apps (Fieldwire/Powerplay-class), compare against ours — sets the bar objectively instead of taste.                                                                           | IDLE — needs reference app access  |
| **Compound** | learnings → `AGENTS.md`/`DECISIONS.md`/`.jez/artifacts/`                                | Every finding becomes a written convention, not a memory.                                                                                                                                                         | ACTIVE                             |

## Cadence

- **Each fix round** (current): `ux-audit` live sweep, continue. After each round, `design-review` on touched pages.
- **Next**: `ux-walkthrough-audit` static pass over `/m/*` — finds the doomed-action/dead-state class systematically instead of one-at-a-time by luck.
- **Per persona**: `ux-workflow-check` against the `.jez/audit-personas/` files — write missing personas first (store-keeper, security guard exist in tests; add owner-accountant).
- **Before any new build**: full speckit pipeline; `gauntlet` verifies each spec claim before `implement`.
- **Daily close**: `gauntlet` on DECISIONS.md "verified live" claims that touched the day's changed code.
- **Pre-launch gate**: `responsiveness-check` full sweep + `onboarding-ux` audit + `ux-walkthrough-audit` repeat — all three green before deploy.

## The drift guard (why pages lose symmetry)

Pages drift when they skip the shared primitives with no spec to check them
against. `dimensional-drawing` artifacts for `detail-primitives.tsx` (hero,
stat grid, key-value card, link row, timeline, alert banner) = the redline a
new page gets held to. **Rule: new/changed detail page ⇒ screenshot ⇒
compare to the spec sheet ⇒ `design-review` if it deviates.**

## Explicitly NOT doing

- `ux-extract`/`ux-compare` parked until a reference app is accessible — don't fake the inputs.
- `anatomy` deferred — marketing-facing, not launch-blocking.
- No new dependencies — the ledger rule stands (adopt patterns, not packages).

---

## Findings ledger

### ux-walkthrough-audit — bounded pass (2026-10-29)

- **3a auth completeness**: covered — `/sign-in`, `/forgot-password` → `/reset-password`, `/change-password` + `/api/me/change-password`, sign-out buttons in every shell. No public signup — company-provisioned by design (admin mints users).
- **3b entry states**: empty/loading/error/404 conventions all exist (`EmptyState`, `PageLoading`, `NoAccess`, `MobileEmptyState`) and were exercised live in the sweep.
- **3d render-state flash**: clean — no bare `hidden` attrs with CSS display overrides (chip-flash class absent).
- **3c dead exports**: 49 service exports with zero call sites (definition line only). Verified stale helpers, not missing features — e.g. `postSupplierPayment` (superseded by direct `postJournalEntry` in `createSupplierPayment`), `is*TransitionAllowed` family (all transitions enforced inline: `if status !== X throw`), `validate*Input` family (validation inlined). **Cleanup candidate, not launch-blocking** — bulk-delete only after a per-file review for future-use intent.
- **The real catch stayed the doomed-action class** — found via the live sweep (`ux-audit`), fixed in `f822199e`/`db323191`/`6927fbee`.
