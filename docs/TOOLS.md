# Tools Ledger

Everything this project uses that is actually pulling its weight — external
repos, skills, patterns borrowed from other projects, and the homegrown
harnesses. Honest about what was adopted whole, what was mined for patterns,
and what was evaluated and rejected.

## External repos adopted

| Tool                             | What we take from it                                                                                                                                                                                                                                                                  | Status                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enesozturk/dimensional-drawing` | Apple-style monochrome spec sheets of UI components — measured `getBoundingClientRect` values rendered as a variable-based drawing (title block, notes, plan view, exploded layer stack, detail callouts, variable tables). Used to lock the symmetry bar on high-traffic components. | Skill installed at `.devin/skills/dimensional-drawing`. First sheet: `.jez/artifacts/dimensional-list-row.html` (mobile stock row, measured live @390 vw). Harness: `scripts/measure-card.mjs`. |

## Patterns borrowed (not installed)

| Source                               | Pattern                                                                                                                                                                                                                                                                                                          | Where it landed                                                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devkitshq/notifkit`                 | Claim-before-send: a flush must atomically move `PENDING → SENDING` before any external call; stale `SENDING` rows reclaim after a timeout; pass the claimed `logId` into the sender so the pending row is reused instead of minting a second log row.                                                           | `NotificationStatus.SENDING` + claim logic in `packages/services/src/notification-handlers.ts` + `logId` passthrough in `sendNotification` (commit `c37403a7`). |
| `devkitshq/notifkit`                 | Idempotent, auditable delivery: every send resolves to exactly one log row with `SENT`/`FAILED` + error — never a silent skip when all channels bail.                                                                                                                                                            | Same commit.                                                                                                                                                    |
| Google EGM (Elephant-Goldfish Model) | Spec stress-testing: deep-context "Elephant" drafts an anchored hypothesis; zero-context read-only "Goldfish" reviewers attack it in parallel from separate lenses (contrarian, codebase detail, design, implementability, tech-debt, cost). Kills false findings, surfaces real ones without conversation bias. | `concepts_brief.md` — the tenancy/procurement/notification review that produced the B1 rent-free billing fix and the rest of the ranked ledger.                 |

## Evaluated and rejected

| Tool                                                                                              | Why rejected                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devkitshq/notifkit` as a service                                                                 | A full self-hosted notification server would duplicate the existing stack (templates, preferences, quiet hours, delivery log, WhatsApp/email/push senders already live). We adopted its send-side patterns, not the server. |
| `pwpearson/dimensional-drawings`, `adrien-delhorme/openscad-new-dimensions`, `pzfreo/draftwright` | CAD/OpenSCAD libraries for construction geometry — wrong domain. The platform needs UI-component spec sheets, not mechanical drawings. `enesozturk/dimensional-drawing` is the correct repo.                                |

## Skills installed for this repo

| Skill                       | Use                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `dimensional-drawing`       | Spec sheets for component symmetry/polish (see above).                                                                 |
| `ux-audit`                  | Full dogfood walks — proof-of-interaction audits with hard gates (0 console errors, 0 5xx, axe critical, perf budget). |
| `design-review`             | Visual-polish findings: layout, type, spacing, hierarchy, responsive.                                                  |
| `responsiveness-check`      | Breakpoint sweeps — catches overflow/collapse between widths.                                                          |
| `onboarding-ux`             | Empty states, tours, hints — the "uneducated user can use it" bar.                                                     |
| `ux-extract` / `ux-compare` | Pattern libraries from reference apps for comparison.                                                                  |
| `anatomy`                   | Isometric technical figures for docs (available; unused so far).                                                       |

## Homegrown harnesses doing the heavy lifting

| Tool                                     | What it verifies                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-workflows-full.sh`       | 70 checks / 29 groups — drives every core state machine over HTTP, asserts status flips + side-effect rows + audit entries + negative guards. The backbone of "does the business logic hold". |
| `pnpm --filter web e2e`                  | ~300-route smoke + `@flow` multi-role workflow specs, own dev server on :3100.                                                                                                                |
| `pnpm --filter @nirman/services test`    | 1,849 tests against real Postgres (`nirman_inventory_test`) — not mocks.                                                                                                                      |
| `apps/web/scripts/dev-with-recovery.mjs` | Self-healing dev wrapper — Turbopack desync recovery, deterministic-error webpack fallback, schema/dependency watchers.                                                                       |
| `scripts/measure-card.mjs`               | Playwright live-measurement harness feeding the dimensional drawings — real rendered geometry, never invented values.                                                                         |
| `concepts_brief.md`                      | The EGM review artifact — ranked Blocker/Major ledger of business-logic findings; the roadmap for this production-hardening pass.                                                             |
| `codebase-memory-mcp`                    | Knowledge graph for callers/callees/impact — used before negative claims about coverage.                                                                                                      |

## Rule of adoption

Adopt a tool only if it fixes a defect we actually have (or a repeat-task we
actually run). Mine repositories for _patterns_ first; install a dependency
only when the pattern can't be written cleanly in-house. Every adopted item
above has a concrete landing site — file, commit, or artifact.
