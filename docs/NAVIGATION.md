# Mobile Navigation — Audit & Target Architecture

> **Status**: **Phase 1 landed** (manifest + CI guards). Phases 2-5 awaiting go-ahead.
> **Scope**: `/m/*` (176 routes). Desktop (`/`, 145 routes) is touched only in
> Phase 5, and only to converge on the same source of truth.
> **Companions**: `docs/MOBILE_UX_RESEARCH.md` (patterns + evidence),
> `docs/MOBILE_UX_AUDIT.md` (2026-08 gap audit), `docs/MOBILE_FLOW_MAP.md`.

---

## 0. TL;DR

The mobile app has **nine** navigation mechanisms layered on **six** hand-maintained
lookup maps that are keyed off the same path segments and can drift independently.
They have drifted: 46 of 121 real static routes are absent from the nav config and
17 are reachable only by typing the URL. The sitemap is unreachable from 97% of
pages, and the entire "adaptive navigation" layer (Next Step, flow-aware Related,
entity titles) is **dead code** because a React context is read by a component that
sits _above_ its provider.

None of this is a styling problem. The fix is to make the route tree the single
source of truth and derive every navigation surface from it, then enforce that in
CI so it cannot rot again.

> **Correction (Phase 1)**: the first pass of this audit over-counted the orphan
> and duplicate routes. 13 of the routes flagged are **already redirect stubs**
> (`/m/transfers` → `/m/stock?tab=transfers`, `/m/requisitions` →
> `/m/procurement?tab=indents`, and 11 more) — that is correct canonicalisation
> that was already in place, not drift. Every count below is the corrected one,
> measured by the guards now in CI.

---

## 1. Current state

### 1.1 The nine mechanisms

| #   | Mechanism                             | Implementation                                   | Reach                             |
| --- | ------------------------------------- | ------------------------------------------------ | --------------------------------- |
| 1   | Persona bottom tab bar                | `lib/mobile-nav-v2.ts` → `PERSONA_TABS`          | 5 slots, 1 spent on Search        |
| 2   | NavSheet "All pages" accordion        | `components/mobile/v2/nav-sheet.tsx`             | ~130 links                        |
| 3   | Back chevron + edge-swipe + fallback  | `mobile-shell.tsx` L415-473                      | all pages                         |
| 4   | In-page `?tab=` hub tabs              | 6 × `Mobile*HubTabs.tsx`, `lib/use-tab-param.ts` | 20 tab values                     |
| 5   | Global search overlay                 | `mobile-global-search.tsx`                       | 13 entity types + `ALL_NAV_LINKS` |
| 6   | Orbit navigator (radial hub)          | `orbit-navigator.tsx`                            | `/m/home` only                    |
| 7   | FAB + FAB modal                       | `scaffold.tsx`, `fab-modal.tsx` (74 files)       | create flows                      |
| 8   | Pinned / Recent / Related / Next Step | `use-nav-preferences.ts`, `flow-map.ts`          | NavSheet only                     |
| 9   | Command palette + voice agent         | `command-palette.tsx`, `voice-agent-button.tsx`  | keyboard / voice                  |

### 1.2 The six maps (the root cause)

| Map                | Entries                | File                                |
| ------------------ | ---------------------- | ----------------------------------- |
| `NAV_GROUPS`       | ~130 links / 5 modules | `lib/mobile-nav-v2.ts`              |
| `PATH_TO_MODULE`   | 60                     | `lib/mobile-nav-v2.ts`              |
| `WORKFLOW_LINKS`   | 20                     | `lib/mobile-nav-v2.ts`              |
| `PERSONA_TABS`     | 7 × 5                  | `lib/mobile-nav-v2.ts`              |
| `TITLE_MAP`        | 60                     | `mobile-shell.tsx` (function-local) |
| `MODULE_GROUP_MAP` | 18                     | `nav-sheet.tsx` (render-body-local) |

Plus a seventh, `WORLDS` in `lib/nav.ts` (1246 lines, 92 hrefs), which models the
_same product_ under a completely different IA — four worlds (Today / Build /
People / Books) versus mobile's five modules (home / inventory / hr / accounts /
settings). Desktop and mobile disagree about what the product _is_.

Adding one page correctly requires 4-6 edits across 3 files with zero enforcement.
Drift is not a discipline failure; it is the architecture's default outcome.

### 1.3 Measured defects

All figures verified against the working tree.

**D1 — The sitemap is unreachable from 97% of pages.** _(critical)_
The 3-dot button renders only when `!isDrillDown`, and
`isDrillDown = !isModuleHome(pathname, personaTabs)`, where `isModuleHome` is
`tabs.some(t => t.href === pathname)` — an exact string match. Tab hrefs
containing `?tab=` can never match a pathname. Result: the menu exists on
**4 of 132** static routes (3 for the `field` persona). On the other 128 the user
has a back chevron and 4 tabs.

**D2 — The adaptive layer is structurally dead.** _(critical)_
`app/m/layout.tsx` renders `<MobileShellV2>{children}</MobileShellV2>`.
`PageContextProvider` is rendered _inside_ `children`. `NavSheet` is rendered by
the shell as a _sibling_ of `children`. React context flows down, so
`usePageContext()` inside NavSheet **always returns `{}`**. Next Step
(`nav-sheet.tsx` L136-152) and flow-aware Related (L157-173) can never fire. The
file header comment describes context that "flows upward from page → shell",
which React does not do. Only 6 of 43 detail pages set the provider anyway.
_(Note: the on-page `NextActionCardView` in `/m/procurement/[id]` does work — it
calls `resolveNextAction` directly. It is the NavSheet copy that is dead.)_

**D3 — Detail pages show list titles.** `pageTitleFromPath` falls back to the
parent segment for cuid-looking segments, so `/m/hr/employees/clx…` renders the
header **"Employees"** on one specific person's page. The shell never reads page
context (it does not import it), so a real entity label can never reach the header.

**D4 — Multiple tabs active simultaneously.** `isModuleActive` strips the query
string before comparing. For the `hr` persona on `/m/hr`, the HR tab
(`/m/hr`), Attendance tab (`/m/hr?tab=attendance`) and DPR tab (`/m/hr?tab=dprs`)
all return `true`. Three tabs light up at once. Same class of bug for `field`.

**D5 — Orphaned routes.** 176 route files: 13 redirect stubs, 42 dynamic, **121 real
static routes**. Of those, **46 have no tab or NavSheet entry**, and **17 are
referenced by no link anywhere in `src/`** — reachable only by typing the URL:

```
/m/expense-claims  /m/petty-cash  /m/safety  /m/hr/leaves  /m/hr/pending
/m/reports/balance-sheet
+ 11 /new create pages (materials, suppliers, quotations, requisitions,
  supplier-returns, supplier-payments, subcontractors, stock-counts,
  stock-locations, scrap-generations, material-sales, brokers)
```

Some `/new` pages may be intentionally superseded by FAB modals — see §7 Q5.

**D6 — Duplicate URLs for one concept.** **19 routes render the same list component
as another route.** Measured, not assumed — `/m/accounts` re-renders the lists owned
by `/m/expenses`, `/m/expense-claims`, `/m/petty-cash`, `/m/supplier-payments`,
`/m/books/gl` and `/m/books/receipts`; `/m/real-estate` those of `/m/projects`,
`/m/units`, `/m/land`, `/m/rentals`, `/m/brokers`; `/m/construction` those of
`/m/work-orders`, `/m/change-orders`, `/m/quality-control`; and `/m/customers`
shares its list with `/m/leads`. Consequences: no tab highlights on the standalone
route, Up behaves differently by entry path, and pin/recent/search treat them as two
places. All 19 are now declared in `sharesListWith` and frozen by guard G5.

**D7 — Back is not Up.** `goBack()` calls `router.back()` whenever
`history.length > 1`, which is true for a WhatsApp deep link opened in an existing
tab — so "back" leaves the app. The thoughtful `goBackFallback()` hierarchy logic
runs only when `history.length <= 1`, i.e. almost never.

**D8 — Menu ergonomics.** The NavSheet panel is `width: 50%; max-width: 11rem`
(176 px) and holds a five-module accordion over ~130 links, with a 5-column module
grid inside 176 px (≈32 px targets, below the 44 px minimum this repo's own
research mandates).

**D9 — Unconditional badge fetching.** `ALL_BADGE_TABS` fires 4 API calls on every
shell mount for every persona, including badges for tabs that persona cannot see.

**D10 — Per-user permission grants are invisible in the UI.** _(critical)_
The server authorises against `role matrix + RolePermission + UserPermission`
(`getUserPermissions()` in `lib/server.ts`). The client received **only `role`**:
`/api/me` returned no permissions and `usePermissions().can()` was
`hasPermission(role, perm)` — the role matrix alone. So a permission granted to
one individual through the Team screen was enforced by the API but produced no
nav entry, no menu row and no button anywhere. Granting it was silently a no-op
unless the user typed the URL. Navigation compounded this by filtering on a
_third_, coarser model — persona — so three different notions of access were live
at once. Fixed in Phase 1.5; see §3.6.

### 1.4 Why the previous audit's defence no longer holds

`docs/MOBILE_UX_AUDIT.md` §A4 justifies the NavSheet over a "More" tab on the
grounds that it is "discoverable (3-dot icon is learned quickly)" and "only for
secondary navigation". That reasoning is sound _for a menu that exists_. Per D1
the menu is absent on 128 of 132 pages, so the pattern was never actually shipped.
A4's conclusion should be re-scoped to: _the sitemap pattern is right; its trigger
placement is wrong._

---

## 2. What the evidence supports

Consolidated from `docs/MOBILE_UX_RESEARCH.md` §1 plus primary sources:

- **Bottom bar, 3-5 destinations.** 70-80% of nav taps land there; Material 3
  (May 2025) deprecated the phone drawer in favour of it. Both M3 and Apple HIG
  cap at 5. (`MOBILE_UX_RESEARCH.md` §1.1-1.2)
- **A tab bar is for sections, not actions**, and must stay visible everywhere;
  avoid overflow/More tabs; for complex hierarchies prefer a tab bar that adapts
  to a sidebar over adding tabs.
  ([Apple HIG — Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars))
- **Hidden navigation is used far less**, so anything load-bearing must be
  persistently visible; for deep hierarchies use category landing pages and
  breadcrumbs rather than deeper menus.
  ([NN/g — Beyond the Hamburger](https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/),
  [NN/g — Basic Patterns for Mobile Navigation](https://www.nngroup.com/articles/mobile-navigation-patterns/))
- **Search is the universal escape hatch** in deep-hierarchy products
  (Linear's explicit fix after tabs-disappear-on-drill-down failed). Ours is
  correct in kind but wrongly placed: it consumes a _destination_ slot and is
  reachable on only 4 pages' worth of chrome variation.
  (`MOBILE_UX_RESEARCH.md` §1.3)
- **At 50+ screens** the failure mode is flat 20+ item menus; the fixes are
  progressive disclosure, a stable navigation spine, and breadcrumbs that reflect
  the real path.
  ([RIVER — IA for complex enterprise apps](https://rivergroup.ai/insights/information-architecture-complex-enterprise-apps))
- **Persona-adaptive tab positions** are proven (Linear iOS 26, Salesforce Mobile).
  Our persona model is a genuine strength and is kept.

---

## 3. Target architecture

### 3.1 Principle

> **The route tree is the source of truth. Every navigation surface is a
> projection of it. Nothing about navigation is maintained by hand twice.**

### 3.2 The route manifest

`apps/web/src/lib/route-manifest.ts` — one entry per route, replacing
`NAV_GROUPS`, `PATH_TO_MODULE`, `TITLE_MAP`, `WORKFLOW_LINKS`, `MODULE_GROUP_MAP`.
**Shipped in Phase 1** — read the file for the authoritative schema; the shape is:

```ts
export type RouteKind =
  | "hub"
  | "list"
  | "detail"
  | "create"
  | "edit"
  | "report"
  | "tool"
  | "redirect";

export interface RouteEntry {
  path: string; // as on disk under app/m, may contain [id]
  title: string; // detail routes: fallback until the entity label arrives
  parent: string | null; // the Up target — null ONLY for /m/home and /m
  kind: RouteKind;
  module: ModuleId; // home | inventory | hr | accounts | settings
  icon: LucideIcon;
  hint?: string; // one plain line — menu subtitle, search, tooltip
  personas?: Persona[]; // omit = everyone
  keywords?: string[];
  badge?: { endpoint: string };
  flowId?: FlowId; // enables Next Step + Related
  desktopPath?: string; // Phase 5 convergence
  redirectTo?: string; // for kind: "redirect"
  hidden?: boolean; // deep-linkable + searchable, not in the menu
  sharesListWith?: string[]; // declared duplicate destinations (guard G5)
}
```

Two deviations from the original proposal, both forced by evidence:

- **`personas`, not `roles`.** The same href appears on several links in
  `lib/nav.ts`, so first-match role inference was unreliable and would have
  wrongly hidden pages. `personas` is faithful to the filtering that
  `NAV_GROUPS` already performs. Role scoping converges in Phase 5.
- **Home is the only root.** Module hubs are children of `/m/home`, not
  parentless. See §4.1 for why — it was G3 that proved it.

Everything below is _derived_, never re-declared:

| Surface           | Derivation                                                    |
| ----------------- | ------------------------------------------------------------- |
| Header title      | `entry.title`, overridden by live page context label          |
| Up target         | `entry.parent`                                                |
| Breadcrumb chain  | walk `parent` to root                                         |
| Menu tree         | group by `module`, filter by `roles`, sort by `kind`          |
| Active tab        | nearest ancestor in `parent` chain that is a tab root         |
| Search page index | `title` + `hint` + `keywords`                                 |
| Command palette   | same index, shared with desktop                               |
| Badges            | only for routes in the _current persona's_ tab set (fixes D9) |
| Related links     | siblings under the same `parent` + same-`flowId` nodes        |
| Next Step         | `flowId` + live status from page context                      |

### 3.3 The four layers (and only four)

**1. Bottom tab bar — 4 destinations. No Search tab, no More tab.**
Freed by moving Search _and_ the menu into the header. Tab hrefs must be plain
pathnames (no `?tab=`), which is what fixes D4 structurally.

| Persona     | Tab 1 | Tab 2     | Tab 3      | Tab 4     |
| ----------- | ----- | --------- | ---------- | --------- |
| executive   | Home  | Inventory | People     | Books     |
| ops         | Home  | Inventory | Stock      | Site      |
| procurement | Home  | POs       | Stock      | Suppliers |
| field       | Site  | Tasks     | DPR        | Stock     |
| sales       | Home  | Sales     | Customers  | Leads     |
| finance     | Home  | Books     | Reports    | Expenses  |
| hr          | Home  | People    | Attendance | DPR       |

_(Draft — §7 Q1 asks whether to validate these against real usage before locking.)_

**2. Header — present and identical on all 175 routes.**

```
[ ← Up | ☰ Menu ]  Title
                   Subtitle                    [ 🔍 Search ]  [ ⋮ Actions ]
```

- Left slot is **Up** on any route with a `parent`, **Menu** on the four tab roots.
  The menu is _also_ always available from the `⋮` overflow, so the sitemap is
  reachable from every page (fixes D1).
- Title comes from the manifest; when the page announces an entity, it becomes
  the entity label with a subtitle (fixes D3).
- Search is a persistent header control on every page (fixes the reach problem
  and honours Apple HIG's "tab bar = sections, not actions").

**3. Hub landing pages carry the IA.** Six hubs already exist and are the right
idea. They become the real second level, with **one canonical URL per concept**
(fixes D6). See §3.5 for how `?tab=` becomes routing.

**4. Long tail = search + a generated index.** Pinned/Recent/Related stay, but
become additive personalisation on top of a complete generated tree — never the
only path to a page.

### 3.4 Fixing page context (D2)

Replace the provider-inside-children pattern with a module-level store read via
`useSyncExternalStore`, so the shell (above `children`) can subscribe:

```ts
// lib/page-context-store.ts
export function useSetPageContext(value: PageContextValue): void; // called by pages
export function usePageContext(): PageContextValue; // read by shell + NavSheet
```

- Detail pages call `useSetPageContext({ entity, flowId, status, label, subtitle, recordId, canActions })`.
- The store clears on `pathname` change, so a stale label can never leak.
- This single change makes entity titles, Next Step, and flow-aware Related work
  for the first time.
- Roll out to all 43 detail routes, not 6. The manifest already declares `entity`
  and `flowId` per route, so pages only supply the live `status`/`label`.

### 3.5 Canonical URLs: `?tab=` → route segments

`?tab=` cannot express active state, Up, or breadcrumbs, and it forces the
duplicate-route problem. Hub tabs become real segments:

```
/m/hr?tab=attendance      →  /m/hr/attendance
/m/stock?tab=transfers    →  /m/stock/transfers   (delete /m/transfers)
/m/accounts?tab=claims    →  /m/accounts/claims   (delete /m/expense-claims)
```

Mitigations for a 22-file blast radius (`use-tab-param.ts` consumers):

- Keep `useTabParam`'s API; back it with the pathname segment.
- Add `next.config` redirects from every legacy `?tab=` URL and every deleted
  duplicate route, permanently — external links and bookmarks keep working.
- Migrate hub-by-hub, one PR per hub.

### 3.6 Role- and permission-adaptive navigation

**The problem.** Access is not a role. It is `role matrix + RolePermission
overrides + per-user UserPermission grants`, merged by `effectivePermissions()`
and enforced by `getUserPermissions()` in `lib/server.ts`. Because
`UserPermission` rows are granted per individual — exactly what the employee
account-creation flow does — the real population of access patterns is `2^n`,
not seven personas. A store keeper with `finance.view` and `po.approve` added by
hand is a supported, ordinary configuration.

**The bug this exposed** _(D10, found while designing this)_. The server
authorises against the merged set. The **client only ever received `role`** —
`/api/me` returned no permissions, and `usePermissions().can()` was
`hasPermission(role, perm)`, i.e. the role matrix alone. So a permission granted
to one individual was enforced by the API but **invisible in the UI**: no nav
entry, no menu row, no button. Granting it was silently a no-op unless the user
typed the URL. Three different access models were live at once — effective
permissions (server), role matrix (client `can()`), and persona (navigation).

**The fix — separate two questions the old design conflated:**

| Question                      | Answer comes from                                       | Nature                                                        |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| **May I open this?**          | `perm` on the route vs the user's effective permissions | Hard gate. Identical to the server's answer.                  |
| **Is this prominent for me?** | persona (derived from role)                             | Soft ranking. Tab slots, section order, what starts expanded. |

Persona **never hides anything you are allowed to open**. That single rule is
what makes arbitrary permission patterns work with _zero_ extra navigation
config: grant one store keeper `finance.view` and Books appears in their menu;
nothing in `route-manifest.ts` changes.

**Implementation.**

- Every route declares `perm` — the permission required to open it, the same key
  the page already enforces. Seeded by extracting `PERM.*` references from each
  route's own files (146 of 177 routes), with a hand-reviewed override list for
  the ~30 cases where the cheapest referenced permission was a write/approve key
  that would have hidden the page from legitimate read-only users.
- Omitted `perm` **inherits from `parent`** (`permFor` walks the chain), so
  `/m/materials/[id]` needs no restatement of `inventory.view`. A route whose
  whole chain omits it is universal — Home, My Profile, Settings, Queue.
- `/api/me` now returns `permissions: string[]` (the effective set). The mobile
  shell already fetches `/api/me`, so this costs no extra round-trip.
- `canAccess(route, permissions)` gates the menu, the tab bar **and search** —
  search included, or search becomes a way to walk into a 403.
- `tabsFor(ctx)` takes the persona's four preferred tabs, drops any the user
  cannot access, and backfills from a global priority list ending in four
  universal routes — so **every user gets exactly four valid tabs**, however
  narrow their grants. Prominence is deliberately _stable_: an unrelated grant
  must not rearrange the bar under the user's thumb (guard G7).
- `menuFor(ctx)` returns every accessible route grouped by module, with
  `prominent` deciding order and initial expansion. Nothing accessible is
  hidden — which is also how the 17 URL-only routes rejoin the navigation, for
  the people entitled to them.
- **Project scoping stays out of navigation.** `ProjectAssignment.scopedRole`
  filters _data_, not routes: the route appears, the page shows only their
  projects. Conflating the two would hide whole modules from site staff.

**Why this is the elegant form.** The alternatives all scale badly:
per-role menu definitions (13 roles × drift), per-user stored menus (unbounded
state, needs migration on every new route), or feature flags per user (same
problem plus no relation to authorisation). Gating on the permission the server
already checks means navigation cannot disagree with authorisation — there is
only one source of truth for access, and the nav is a pure function of it.

Two invariants now enforce it, property-tested over 69 permission sets
(7 personas + superuser + zero-permission + 60 random):

- **G6 — no dead ends.** Nothing the navigation surfaces can 403.
- **G7 — no invisible capability.** Every permission that gates a route surfaces
  at least one menu entry when held. This is the regression test for D10.

### 3.7 Up vs Back

- Header chevron = **Up** (`entry.parent`) — deterministic, deep-link safe.
- Edge-swipe = **Back** (`history.back()`) — matches OS convention; keep it.
- Delete `goBackFallback`; the manifest supersedes it.

---

## 4. Validation

### 4.1 CI guards (`apps/web/src/lib/route-manifest.test.ts`)

| #   | Assertion                                                                   | Status         |
| --- | --------------------------------------------------------------------------- | -------------- |
| G1  | Every `app/m/**/page.tsx` has a manifest entry, and every entry has a file  | ✅ 177/177     |
| G2  | Every route is ≤3 hops from a tab root for ≥1 persona; no orphaned parents  | ✅             |
| G3  | Exactly one tab resolves active for every route the user can open           | ✅             |
| G4  | `parent` is a path ancestor or a hub; no cycles; never points at a redirect | ✅             |
| G5  | Routes sharing a list component declare each other in `sharesListWith`      | ✅ 19 declared |
| G6  | Nothing the nav surfaces can 403; every `perm` is a real permission key     | ✅             |
| G7  | Every permission that gates a route surfaces ≥1 menu entry when held        | ✅             |
| G8  | Exactly four valid tabs, ≤1 active, for any permission set                  | ✅             |
| G9  | Only an allowlisted handful of routes are ungated (universal)               | ✅ 4 allowed   |
| G10 | Next Step renders on ≥1 real detail page (dead-code canary)                 | Phase 2        |

36 assertions in `apps/web/src/lib/route-manifest.test.ts`, all passing.
G6-G8 are property-based over 69 permission sets (7 personas + superuser +
zero-permission + 60 seeded-random), because per-user `UserPermission` grants
make the real access space `2^n`, not seven personas.

G1 is the important one: it makes orphan routes _impossible_, not merely
discouraged, and it is what stops this document being needed again in six months.
G5 does the same for duplicate URLs — it freezes today's 19 and fails on any new
one, so Phase 3 works against a set that cannot grow underneath it.

**What the guards caught that the audit missed.** G3 initially failed on **225**
route × persona pairs. Cause: the manifest had seeded all five module hubs as
parentless roots, so a persona whose tabs don't cover a module (a finance user on
`/m/inventory`) had no tab to light up. Fix: **Home is the only root** — every
other module hub hangs off it, so the parent chain always terminates at a tab
root. That is now enforced by G4 (`only Home is a root`), and it is exactly the
kind of defect a diagram review never catches.

**And what the capability guards caught after that.** Once G3 ran against real
permission sets instead of persona groups, the `field` tab set failed on **81**
routes. A `SITE_ENGINEER` does not only touch Site/Tasks/DPR/Stock — the role
matrix grants them `boq.view`, `procurement.view`, `inventory.view`, `hr.view`
and `assets.view`, so 81 routes they are entitled to open had no tab to anchor
them. **Every persona now has Home as tab 1** (Tasks lost the slot; `/m/site`
already surfaces it one tap away). The `TAB_EXEMPT` escape hatch from the earlier
draft is deleted — the invariant now holds with no exceptions, which settles §7 Q2
on evidence rather than taste.

**And the leak G9 was written to catch.** A route with no `perm` anywhere up its
parent chain is open to everyone, and no amount of self-consistency checking
finds that — `canAccess` returns true _by definition_. The seed had left the
Inventory, HR, Site, Pulse, Attendance and Expenses hubs ungated, because those
particular page files reference no `PERM.*` directly (their child pages do). Net
effect: a user with **zero** permissions saw Inventory and HR tabs and a 17-route
menu. Twelve hubs are now gated explicitly and the universal set is an
allowlist of four — `/m/home`, `/m/me`, `/m/queue`, `/m/settings`. Redirect stubs
are exempt, since their target enforces the gate.

Observed behaviour after the fix:

| User                            | Tabs                                         | Menu routes |
| ------------------------------- | -------------------------------------------- | ----------- |
| zero permissions                | Home / More / My Profile / Offline Queue     | 4           |
| `STORE_KEEPER`                  | Home / POs / Stock / Suppliers               | 46          |
| `STORE_KEEPER` + `finance.view` | Home / POs / Stock / Suppliers _(unchanged)_ | 71          |
| `SITE_ENGINEER`                 | Home / Field Dashboard / DPRs / Stock        | 62          |
| `OWNER`                         | Home / Inventory / HR / Accounts             | 104         |

The third row is the point: one extra grant widens what they can reach by 25
routes without disturbing the tab bar under their thumb.

### 4.2 Task-based validation

Five tasks × seven personas, tap-counted before/after:

1. Receive goods against a known PO
2. Approve yesterday's DPRs
3. Check cement stock at Site B
4. Record a petty-cash expense
5. Find customer Sharma's payment status

Target: no task above 4 taps from cold start; no task requiring the search
overlay for a _browsable_ destination.

---

## 5. Migration plan

| Phase                       | Work                                                                                                                                                                                      | Risk                              | Unblocks            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------- |
| **1. Manifest + guards** ✅ | `route-manifest.ts` — 177 entries + derivation helpers; `route-manifest.test.ts` — 35 guards. No UI change; nothing imports it yet.                                                       | Low — additive                    | everything          |
| **1.5 Capability model** ✅ | `perm` per route + inheritance; `/api/me` returns effective `permissions`; `canAccess`/`tabsFor`/`menuFor`/`searchableFor` gate on capability with persona as ranking only. Guards G6-G8. | Low — additive                    | D10, all of Phase 2 |
| **2. Shell rewrite**        | Header (Up/Menu/Title/Search/Actions), 4-tab bar, page-context store, active-tab from manifest. Delete `TITLE_MAP`, `MODULE_GROUP_MAP`, `PATH_TO_MODULE`, `goBackFallback`. Add G3/G6.    | Medium — every page's chrome      | D1, D2, D3, D4, D7  |
| **3. Canonical URLs**       | `?tab=` → segments, one hub per PR; delete duplicate routes; add permanent redirects. Add G5.                                                                                             | Medium — 22 files, external links | D6                  |
| **4. Menu + long tail**     | Regenerate NavSheet from the manifest (full-width panel, ≥44 px targets), wire the 57 orphans, persona-scoped badges. Add G2.                                                             | Low                               | D5, D8, D9          |
| **5. Desktop convergence**  | `WORLDS` in `lib/nav.ts` becomes a projection of the manifest; one IA, two renderers.                                                                                                     | Medium — 1246-line file           | the 7th map         |

Phases 1-2 remove all four critical defects. Phase 5 is separable and can be
deferred without leaving the codebase in an inconsistent state.

---

## 6. What is explicitly kept

These are good and survive unchanged:

- **Persona-adaptive tabs** — matches Linear/Salesforce; ahead of most competitors.
- **Global search overlay** — correct model; only its _placement_ changes.
- **Hub pages with sub-navigation** — correct; only the URL mechanism changes.
- **Pinned / Recent** (`use-nav-preferences.ts`) — good personalisation.
- **`flow-map.ts`** — the flow model is sound; it has simply never been wired to
  a surface the user can reach.
- **Edge-swipe back, pull-to-refresh, FAB, command palette, voice agent.**
- **Orbit navigator** — kept on `/m/home` as a _dashboard_ affordance, not
  counted as a navigation layer.

---

## 7. Open questions

1. **Tab sets (§3.3)** — draft only. Lock them from real usage data, or ship the
   draft and iterate?
2. ~~**`/m/home` for field personas**~~ — **RESOLVED on evidence.** Every persona
   gets Home as tab 1. Running G3 against real permission sets showed a
   `SITE_ENGINEER` can open 81 routes with no tab to anchor them (they hold
   `boq.view`, `procurement.view`, `inventory.view`, `hr.view`, `assets.view`).
   Tasks gave up the slot — `/m/site` already surfaces it one tap away.
   `TAB_EXEMPT` deleted; the invariant holds with no exceptions.
3. **Phase 5 scope** — converge desktop onto the manifest now, or ship mobile
   first and leave `lib/nav.ts` as-is for a release?
4. **Deleting duplicate routes** — safe to remove `/m/transfers`, `/m/expense-claims`
   et al. behind permanent redirects, or are any of these URLs in circulation
   (WhatsApp shares, saved bookmarks, printed QR codes)?
5. **The 17 unreferenced routes** — are all 17 wanted? Some `/new` pages may be
   intentionally superseded by FAB modals, in which case they should be _deleted_,
   not linked.
6. **`/api/me` caching vs permission changes.** `/api/me` is cached
   `private, max-age=60, stale-while-revalidate=300`. Now that it carries
   `permissions`, revoking a grant can take up to 5 minutes to disappear from the
   UI. The API still refuses the request throughout, so this is a cosmetic
   staleness, not a security hole — but if you want revocation to feel instant,
   drop `stale-while-revalidate` or bump a session version on permission change.
7. **Per-route `perm` review.** 146 of 177 routes were seeded by extracting
   `PERM.*` from each page, then hand-corrected in ~30 places where the cheapest
   referenced permission was a write/approve key. Worth a domain read-through —
   an over-tight `perm` hides a page from people who should see it, and I
   inferred these from code, not from how you actually staff the business. The
   construction routes are the ones I'd check first: there is no `wo.view` in
   `PERM`, so I gated Work Orders / Change Orders / QC / Safety on
   `projects.view`.
