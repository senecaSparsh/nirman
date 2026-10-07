---
name: walkthrough
description: UX-coverage audit. Catches the class of bug dead-code audits can't — state-machine gaps, missing features (no logout / password reset / settings), empty-state regressions, entry-state combinations nobody walked through after a wholesale UX pattern replacement, and pre-hydration render-state flashes (HTML hidden overridden by CSS display, FOUC, partial-init voids). Static analysis of code paths + a built-in feature-completeness checklist + render-state coverage.
---

# UX Walkthrough Audit

Scan a project's user flows for the bugs static-analysis tools miss. Dead-code audits catch duplicated and dead code; this skill catches **runtime composition issues** — features that don't exist, states that aren't reachable, voids that emerge from cascading UX changes, and entry-state combinations that nobody's walked through.

## When to use this

After a dead-code audit has cleaned up code-shape issues. After a wholesale UX pattern replacement (one feature replacing another). Before declaring a product surface "done." When a real user reports something visually broken that no test caught.

## Arguments

| Argument                    | Effect                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------- |
| (none)                      | Audit the current working directory's primary product surface                         |
| project name (e.g. `myapp`) | Audit that project. Resolve via the alias table below or as a literal path.           |
| `--scope <path>`            | Limit to a specific subdirectory (e.g. `--scope src/components/checkout`)             |
| `--flow <name>`             | Audit one specific user flow (e.g. `--flow signup`, `--flow chat`, `--flow checkout`) |
| `--report-only`             | Skip the Step 6 auto-fix bundle. Produces findings only, no PR.                       |

## Project Registry

| Alias   | Path                     |
| ------- | ------------------------ |
| `myapp` | (add your projects here) |

If a name isn't in the table, the skill should resolve it as a literal path or search for it.

## Process

### Step 1: Detect the project

Identify the framework + primary product surface:

- Web app (Next.js, Astro, Flask/Jinja, etc.) → user flows live in templates + frontend JS
- React Native / Expo → user flows in screen components
- CLI → flows are commands + interactive prompts

Skip if the project doesn't have user-facing flows (a library, a script bundle, a static site without auth).

### Step 2: Identify primary user flows

From the codebase, infer the major flows that exist:

- Authentication (signup, signin, signout, password reset, email verification)
- Onboarding (any multi-step flow that ends with the user inside the product)
- Primary product surface (the daily-use UI: chat, dashboard, list, etc.)
- Account management (settings, billing, subscription, profile)
- Deletion flows (cancel subscription, delete account, forget data)
- Payment (checkout, refund, billing portal)
- Content surfaces (blog, docs, marketing)

Don't infer flows that aren't there — if there's no auth, don't audit auth.

### Step 3: Run all checks

#### 3a. Feature completeness check

For each detected flow, apply a built-in checklist of features users expect. Flag anything missing.

**Authentication flows (web app with accounts):**

- [ ] Signup (any path: email/password, OAuth, magic link)
- [ ] Signin (separate from signup, for returning users)
- [ ] Signout / logout (UI surface that calls the signout function)
- [ ] Password reset flow (forgot-password → email → set-new-password)
- [ ] Email verification (if signup uses email/password)
- [ ] Account-already-exists handling at signup (returning user redirected to signin)
- [ ] Already-signed-in redirect from auth pages (don't make a logged-in user re-auth)
- [ ] Session expiry handling (gracefully prompt for re-signin, don't dump them on a broken page)

**Account management (subscription product):**

- [ ] Cancel subscription (UI, not just an email-the-team path)
- [ ] Update payment method (Billing Portal or local form)
- [ ] Change email
- [ ] Change password (for email/password users)
- [ ] Delete account / "forget my data"
- [ ] Export data (GDPR-friendly, but also a real feature for power users)

**Primary product surface:**

- [ ] Empty state for first-time users (welcome / nudge / starter prompts)
- [ ] Empty state for returning users with no fresh content
- [ ] Loading state (skeleton, spinner, or placeholder content)
- [ ] Error state (network failure, server error, content failed to load)
- [ ] 404 / not-found state (deep-link that doesn't exist)
- [ ] Recovery from interrupted state (mid-stream error, dropped connection)

**Content / public surfaces:**

- [ ] Privacy policy
- [ ] Terms of service
- [ ] Cookie consent (if analytics/tracking is loaded)
- [ ] Contact path (email, support form)

**Implementation hint for detection:** grep for the function name in the codebase. If `signOut`/`logout` is exported but has zero imports, it's a missing-UI feature, not just dead code. If `cancel_subscription` exists in the API but no template references its endpoint, the cancel UI is missing. Cross-reference exported helpers + API routes against UI surfaces that call them.

#### 3b. Entry-state combination scan

For each primary surface, enumerate the entry-state combinations that the surface might be entered with. Flag combinations that:

- Aren't exercised by any test
- Aren't visible in any session log or PR description as having been smoke-tested
- Compose multiple recent UX changes (high regression risk)

For a typical authenticated product surface, the primary states are:

- Anonymous visitor (no session)
- Authenticated, no data yet (just signed up, brand-new)
- Authenticated, partial data (mid-flow, e.g., completed step 1, didn't finish step 3)
- Authenticated, full data + no recent activity (returning user, empty timeline)
- Authenticated, full data + recent activity (the happy path everyone tests)
- Authenticated, paywalled (subscription expired, access pending)
- Authenticated, deleted/suspended

For each, the question to ask: _"What does the user see when they land here?"_ If you can't answer from reading the code + existing tests, that's a finding.

**The cascade trap.** When 3+ recent PRs replaced a UX pattern (not added to it — replaced), explicitly list every entry-state combination and verify the new pattern handles all of them. Cascading replacements are the #1 source of emergent state-composition regressions. Flag any entry state where the answer to "what does this user see?" depends on transient state.

#### 3c. Dead-export check (catches missing-feature signals)

Cross-module dead-export grep — any exported symbol in a module that has zero importers anywhere else in the project. This often shows up in dead-code audits, but here it's a primary signal because **a dead export often means a UI feature was anticipated and never built**.

Run:

```bash
# JS/TS exports
for f in src/**/*.{js,ts,tsx}; do
  grep -E "^export (async )?(function|const|class)" "$f" | extract symbol → grep symbol across project minus the defining file → flag if zero hits
done
# Python equivalent: __all__ lists, or "def name" at module top + cross-file usage check
```

Anything dead-exported is either (a) genuinely unused → real dead code, or (b) anticipated by infrastructure but the UI was never built → a missing-feature signal. Both are worth flagging.

#### 3d. Render-state coverage (pre-JS, mid-JS, post-error)

Entry-state enumeration in 3b assumes "the page has finished loading." That assumption hides a whole class of bugs that users see for 50–500ms on every page load. Walk every primary surface through these render phases:

**Pre-hydration state (HTML loaded, JS module not yet executed):**
For each surface that depends on JS to set initial visibility, check what's visible if the JS module fails to load, is delayed by a slow network, or is blocked by CSP:

- Any element where the HTML has the `[hidden]` attribute but CSS sets `display: <non-none>` (without `:not([hidden])`) — author CSS overrides the user-agent `[hidden] { display: none }`, so the element renders for the entire pre-hydration window. **This is the chip-flash class of bug.**
- Any element with `style="display: none"` inline — fine. Any element relying on a `.hidden` class that JS adds — fine. Any element relying on the bare `[hidden]` attribute when there's also a CSS rule with `display:` for that selector — flash bug.
- Static content that should never appear pre-auth (placeholder dummy data, sample chat threads, "loading..." text that's actually real content)
- FOUT / FOUC: any `@font-face` or `<link>` for a font that the surface depends on — is it preloaded? Does the cascade hide content until fonts ready?

Run:

```bash
# Find every selector with display: that should probably be :not([hidden])
rg -n "^\s*\.[a-zA-Z_-]+\s*\{" path/to/css/ -A 5 | rg -B 1 "display:\s*(flex|block|grid|inline)"
# Then cross-check against templates: does the same class appear with hidden attribute?
rg -n 'class="[^"]*<class>[^"]*"\s+hidden' path/to/templates/
# If yes + CSS doesn't gate on :not([hidden]) → flash bug
```

**Mid-hydration state (JS partially executed, async data loading):**

- Any surface that calls an async fetch for content (history, profile, status) — what does the user see between "JS booted" and "data arrived"?
- Layout shift during async swap — does the surface jump when content loads? CLS impact?
- Skeleton vs spinner vs nothing — what's the convention; does this surface honor it?

**Post-error state (init throws, async fetch fails, JS module 404s):**

- If a critical JS module 404s (cache invalidation, deploy race), what does the user see? A working-looking surface that does nothing on click? A blank surface?
- If the async profile fetch fails, does the surface degrade or block?
- If a third-party module (auth client, analytics) is blocked or slow, does the page fail open or fail closed?
- A dropped SSE / WebSocket mid-stream — is there a recovery path or does the user end up with half a message?

**Concrete deterministic checks (no browser required):**

- For every `class="..."` token where the element ALSO has `hidden`, check the CSS for that class — if any rule sets `display: <non-none>` without `:not([hidden])`, flash bug.
- For every `<script type="module" src="...">`, check that the module's first executed line is something that establishes the surface's visible state (not a no-op import).
- For every async fetch in an init function, check that the surrounding container has a loading state (skeleton, spinner, or initial markup that's safe to show).

Flash bugs are RED severity. They run on every single page load for every user, and they're the dictionary definition of "looks unprofessional."

#### 3e. Test-coverage gap (state-level, not line-level)

Read the test suite and identify which entry-state combinations from 3b are exercised. Flag combinations that have zero coverage. This isn't a substitute for end-to-end tests; it's a "do we have ANYTHING covering this state" check.

### Step 4: Report

Group findings by category with severity:

**RED (missing critical features / broken states):**

- Missing logout, missing password reset, missing cancel-subscription UI
- Empty-state void on a state any user can land in
- A flow that has no exit / can't escape from
- A privacy or terms gap if the product collects PII
- An exported helper for a P1 feature with no UI calling it

**YELLOW (UX gaps worth fixing):**

- Missing account-management features (export, change email)
- Empty states without meaningful content
- Loading/error states that fall through to the default browser behavior
- Entry-state combinations not exercised by any test

**GRAY (consistency / nice-to-have):**

- Inconsistent flow signatures across surfaces
- Missing accessibility patterns (keyboard nav, focus visible)
- 404 page that doesn't match brand voice

For each finding, show:

- Flow / surface
- The specific gap
- File path(s) where the work would land
- Severity (RED / YELLOW / GRAY)
- **Auto-fix eligibility (`auto_fix: true|false`)** — drives Step 6 bundling. See the auto-fix taxonomy in Step 6.
- Linked issue if filing one (in the calling agent's discretion)

**Auto-fix is a separate dimension from severity.** A RED finding can be auto-fixable (chip-flash class — delete the offending CSS rule) or not (missing logout button — needs design judgment). Don't conflate the two.

### Step 5: Optional — deep-walk a single flow

If `--flow <name>` was passed, do a deeper read on that one flow:

- Trace the entry points (routes, links, redirects in)
- Map every state the flow can produce
- For each state, identify the file(s) that render it
- Flag any state that lacks a corresponding test or smoke check
- Generate a manual smoke-test checklist the user can walk through

This is the closest this skill gets to "actually walking" — it produces a human-readable checklist that the user (or another agent with browser access) can execute against a deployed environment.

### Step 6: Auto-fix bundle (default ON; suppress with `--report-only`)

Audits that only describe problems are weaker than audits that ship the easy fixes themselves and file the hard ones for later. Step 6 closes that loop.

**For each finding emitted in Step 4, decide `auto_fix: true|false` using this taxonomy.**

#### Auto-fixable (`auto_fix: true`)

These have a single mechanical, reviewable answer. The fix is short (≤10 lines per finding), reversible, and doesn't require design judgment.

| Finding pattern                                                                    | Fix                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render-state flash: class with `[hidden]` + CSS `display: <non-none>` without gate | Either delete the offending `display:` declaration if the class is rarely or never shown, OR add a `[hidden] { display: none !important }` rule to the project's reset block                                                                                                                             |
| Missing skip-to-content link on a page with a primary nav                          | Add `<a href="#main-content" class="skip-link">Skip to content</a>` after `<body>`, plus a `.skip-link` rule if not in the shared CSS                                                                                                                                                                    |
| Missing `<main>` landmark                                                          | Wrap the existing top-level content `<div>` in `<main id="main-content">` — verify only one `<main>` per page after the change                                                                                                                                                                           |
| Missing `rel="noopener"` on `target="_blank"` external links                       | Append `rel="noopener"` to each `<a target="_blank">` that doesn't already have it                                                                                                                                                                                                                       |
| Static placeholder text visible pre-JS that should never appear                    | Either move it to a `[hidden]` element JS reveals, or delete it if it's vestigial (cross-check with `git log` first to make sure it isn't intentionally there for SEO crawlers)                                                                                                                          |
| Bare-`[hidden]` reliance with author CSS overriding it                             | Site-wide defense: add `[hidden] { display: none !important }` to the project's CSS reset block. Per-element fix: add `:not([hidden])` to the offending selector                                                                                                                                         |
| Inline `<footer>` block instead of the project's canonical footer partial          | Replace the inline block with the include. Pre-flight: read the canonical partial and confirm the inline block is a stale partial of it (missing links, slightly different markup). If the inline block has page-unique content not in the partial, downgrade to `auto_fix: false` (manual integration). |
| Page-CSS rule that overrides a global selector without page-scoping it             | Delete the override if it doesn't add new behavior — let canonical drive. If the override DOES change behavior intentionally, downgrade to `auto_fix: false`.                                                                                                                                            |
| Removable dead exports                                                             | Delete the export + its definition file if not imported anywhere; flag for human review if it's a public API surface                                                                                                                                                                                     |

#### Not auto-fixable (`auto_fix: false`)

These need design judgment, architectural decisions, or substantive refactoring. The fix is longer than 10 lines, branches into multiple right answers, or affects user expectations.

- Missing critical features (logout, password reset, cancel UI, account deletion)
- Empty-state void on a state any user can land in (needs UI design)
- Cascade-trap regressions where the right fix is a state-machine refactor
- A flow that has no exit / can't escape from
- Privacy or terms gap when the product collects PII (legal review)
- Dead exports that look like anticipated-but-never-built features (UI implementation needed)
- Entry-state combinations that lack any test coverage (test-writing is judgment work, not mechanical)
- Loading/error states that fall through to default browser behavior (UI design)

#### Workflow

1. After Step 4 (and Step 5 if `--flow` was passed), partition findings by `auto_fix`.
2. **If the auto-fixable set is non-empty:**
   - Verify a clean working tree on the project's main branch (`git status` clean, `git pull --ff-only`).
   - Create a branch named `walkthrough-fixes-YYYY-MM-DD` (or similar).
   - Apply each fix. Each fix should be a small, reviewable hunk.
   - Run the project's test suite. If tests fail, abort and report the failure — do NOT commit a broken fix.
   - Commit with `walkthrough: <one-line summary of the fix categories>`.
   - Push the branch.
   - Open a PR titled `walkthrough: fix <category 1>, <category 2>, ...`. PR body must list:
     - Each finding fixed (1 bullet each, with file:line and the fix applied)
     - Each finding deferred to follow-up (with a one-line description)
     - A test plan for human review.
3. **For deferred (`auto_fix: false`) findings:** document them in a follow-up file inside the repo (e.g., `docs/walkthrough-findings-YYYY-MM-DD.md`) or file them in your team's issue tracker. If 3+ deferred findings, create a single umbrella note plus sub-findings; otherwise list individually.
4. **Output to caller:** the PR URL + a link to the follow-up document, NOT a full re-print of the report (that already happened in Step 4).
5. **Skip Step 6 entirely** if `--report-only` was passed.

#### When to abort Step 6 mid-flight

- Tests fail after applying fixes. Don't commit broken state.
- A "mechanical" fix turns out to need judgment (e.g., the class with `display:` has 30 callers and you're not sure which ones use `[hidden]`). Move that finding to `auto_fix: false` and file as a follow-up instead.
- The user has an unmerged PR open on the project. Notify the user; don't open a parallel PR that conflicts.
- More than 5 fixes accumulated in one bundle — split into two PRs, one focused per concern (a 5-fix limit keeps the human review pass tractable).

## Important rules

- **This skill fixes the easy stuff and files the rest.** Default behavior is to ship a small PR for auto-fixable findings (Step 6) AND document the rest as follow-ups. Pass `--report-only` to disable the PR step. The skill's value is closing the loop between "found a bug" and "patch is reviewable."
- **Don't propose fixes that drift from project conventions.** Flag the gap; defer to the user / a follow-up issue for the implementation choice. Different products have different right answers (a logout link in the nav vs. a settings panel vs. a chat-header dropdown).
- **Be honest about what static analysis can and can't see.** This skill is fundamentally code-reading + checklist matching. It will not catch issues that depend on actual visual rendering, real network conditions, or third-party service quirks. For those, recommend visual regression tools (Percy / Chromatic) or an actual E2E pass.
- **Don't reinvent dead-code audits.** If you're flagging unused code, dead branches, or duplication for its own sake, that's the wrong skill. This skill's job is the missing-feature / unwalked-state class of bug.
- **The cascade trap is the most common false negative for UX regressions.** When you see in session logs that a UX pattern was wholesale-replaced (not extended) by a recent PR, give that flow extra attention.
- **For new projects, the feature-completeness checklist is the highest-yield check.** The first walkthrough on a young product almost always catches a real missing feature (logout, password reset, cancel UI, error states).
- **For mature projects, the entry-state combination scan is the highest-yield.** Mature products have all the features; the gaps are in state composition.

## What this skill is NOT

- Not a browser automation tool. We don't load pages, take screenshots, or simulate clicks. That's a different category (Playwright, Cypress, Percy).
- Not a substitute for actual smoke testing on a deployed environment. The auto-fix bundle (Step 6) ships verified changes, but production smoke-checks against a real browser are still the human's call.
- Not a replacement for accessibility, performance, or SEO audits. Those are orthogonal: code-shape, accessibility, performance, search-engine. This skill is UX-coverage.
- Not an auto-merger. Step 6 opens a PR for human review; it does not merge.

## Skill Run Logging

If you keep a skill-run log, append an entry after each run:

Format: `| YYYY-MM-DD | /walkthrough | target (details) | one-line result |`
