# Mobile UX Audit — True Gaps & Right-Track Verification

> **Purpose**: A page-by-page audit of the ACTUAL mobile codebase against the
> research in `MOBILE_UX_RESEARCH.md`. This is not a plan — it's a finding of
> what's genuinely missing, what's broken, and what's been intentionally altered
> from standard patterns. The user has made specific design choices that differ
> from the research recommendations — those are respected and noted.
>
> **Methodology**: Read the actual source code of every key page, shared
> component, and navigation structure. Cross-referenced against the 12 research
> sections. No assumptions from plans or docs.
>
> **Last updated**: 2026-08-25

---

## Verdict: Are We On The Right Track?

**Yes — significantly ahead of where the research doc assumed.** The codebase
has already implemented most of the research's top recommendations, and in
several cases has gone beyond them with original patterns (OrbitNavigator,
tracking timeline, voice agent, persona-adaptive tabs with 7 personas).

The architecture is NOT the generic "5-tab bar + hero number + KPI cards"
pattern the research described. It's a more sophisticated, opinionated design
that treats the mobile app as a **navigation-first field tool** (orbit + search
+ nav sheet) rather than a **dashboard-first consumption tool** (hero numbers +
KPI grid). This is a valid and arguably better choice for a construction ERP
where users need to FIND and ACT on entities, not just glance at metrics.

**However, there are 7 true gaps** that are not yet addressed and matter for
real-world use. They are ranked by impact below.

---

## What's Already Done Well (Ahead of Research)

These are implemented and meet or exceed the research standard. No action needed.

| Research area | What's built | Where |
|---|---|---|
| §1 Navigation | Persona-adaptive bottom tab bar (7 personas, 4-5 tabs each) | `mobile-nav-v2.ts` |
| §1 Navigation | Search as center tab (Linear model) with overlay | `mobile-global-search.tsx` |
| §1 Navigation | NavSheet (3-dot overflow) for full sitemap | `nav-sheet.tsx` |
| §1 Navigation | Edge-swipe back with visual chevron indicator | `mobile-shell.tsx` L344-388 |
| §1 Navigation | Pull-to-refresh with progress indicator | `mobile-shell.tsx` L333 |
| §1 Navigation | Recent items carousel ("Jump Back In") | `home-client.tsx` L78-204 |
| §2 Density | Standardized scaffold (search header, filter chips, card grid, FAB) | `scaffold.tsx` |
| §2 Density | 2-col card grid for transactional, 3-col for catalog | `scaffold.tsx` L428 |
| §3 Forms | Draft auto-save (useDrafts) on PO form | `MobileNewProcurementClient.tsx` L89-114 |
| §3 Forms | Last purchase price auto-fill on material selection | `MobileNewProcurementClient.tsx` L154-187 |
| §3 Forms | GST rate auto-fill from material master | `MobileNewProcurementClient.tsx` L160 |
| §3 Forms | Barcode scan to add line item | `MobileNewProcurementClient.tsx` L134-142 |
| §3 Forms | Offline queue — PO form submits offline | `MobileNewProcurementClient.tsx` L231-238 |
| §3 Forms | Success state with 3 next actions (View, List, Create Another) | `MobileNewProcurementClient.tsx` L260-319 |
| §5 Detail | Hero card with entity number, supplier link, status chip | `procurement/[id]/page.tsx` L188-230 |
| §5 Detail | Cross-entity links (supplier, project, source requisition) | `procurement/[id]/page.tsx` L206-272 |
| §5 Detail | Amazon-style tracking timeline (Created→Approved→Ordered→Received) | `procurement/[id]/page.tsx` L312-424 |
| §5 Detail | Receive progress bar with % and pending count | `procurement/[id]/page.tsx` L286-308 |
| §5 Detail | Line items link to material detail pages | `procurement/[id]/page.tsx` L518-543 |
| §5 Detail | Print buttons (PO + GRN) | `procurement/[id]/page.tsx` L220-229, L575-583 |
| §5 Detail | Overdue alert + rejection banner | `procurement/[id]/page.tsx` L233-283 |
| §6 States | Error boundary with "Try Again" + "Go Home" | `mobile-error-boundary.tsx` |
| §6 States | Purpose-built empty state with icon + hint + CTA | `primitives.tsx` L353-374 |
| §6 States | "No results" state (distinct from empty) | `scaffold.tsx` L485-516 |
| §6 States | Skeleton loading (home + detail variants) | `mobile-skeleton.tsx` |
| §6 States | Offline banner with queue count + sync link | `mobile-shell.tsx` L424-452 |
| §8 Touch | Tab bar buttons at 48px (min-h-[3rem]) | `mobile-shell.tsx` L701 |
| §8 Touch | FAB at 56px (size-14) | `scaffold.tsx` L465 |
| §8 Touch | Primitive buttons: 44px/48px/56px (h-11/h-12/h-14) | `primitives.tsx` L36-39 |
| §8 Gestures | Swipe-to-act with haptic feedback | `swipeable-item.tsx` + `use-swipe.ts` |
| §8 Gestures | Long-press context menu as non-swipe alternative | `interactive-list-item.tsx` |
| §9 Color | Semantic status palette via statusMeaning() → single source of truth | `primitives.tsx` L480-501 |
| §9 Color | Filled badges (not outlined) — survives sunlight | `primitives.tsx` L90-115 |
| §9 Color | Warm Industrial palette (borders over shadows) | `primitives.tsx` L14-20 |
| §10 Construction | Voice agent button in header | `voice-agent-button.tsx` |
| §10 Construction | GPS-tagged attendance | `mobile-attendance-form.tsx` |
| §10 Construction | Barcode scanner component | `barcode-scanner.tsx` |

---

## Intentionally Altered Patterns (Respect These)

The user has made specific design choices that differ from the research's
generic recommendations. These are NOT gaps — they are deliberate decisions
and should be preserved.

### A1. OrbitNavigator instead of hero-number + KPI grid

**Research says**: Home dashboard should have one hero number (2-3x larger
than others) + 3-4 KPI cards.

**What's built**: The home page (`/m/home`) uses `OrbitNavigator` — a circular
orbit layout where the company is in the center and related entities (projects,
land, units, employees, equipment) are arranged as orbit chips around it.
Tapping a chip drills into that entity's children.

**Why this is valid**: Nirman is a multi-entity construction ERP. Users need to
NAVIGATE to entities (find a PO, check a project, view a unit) more than they
need to glance at metrics. The orbit pattern is navigation-first, which matches
the actual user workflow better than a consumption-first dashboard. The
"morning briefing" pattern lives at `/m/pulse` (executive) and `/m/site`
(field), not on the home page — this is a clean separation.

### A2. 2-col card grid for PO list instead of compact list rows

**Research says**: Transactional lists (POs, sales, transfers) should use
compact list rows with 3-level hierarchy, not cards.

**What's built**: The PO list uses `MobileCardGrid cols={2}` — each PO is a
small card with accent strip, PO number, supplier, amount, delivery date, and
receiving progress bar.

**Why this is valid**: The cards pack a lot of info into a small space
(receiving progress, overdue status, delivery countdown) that would be cramped
in a single-row list. The 2-col grid shows 6-8 POs above the fold, which is
sufficient for most daily use. The card format also makes the status accent
strip and progress bar more visible than they would be in a list row.

### A3. Tracking timeline on detail pages (Amazon-style)

**Research says**: Detail pages should have sticky header + sticky bottom
action bar + tabs for multi-section content.

**What's built**: The PO detail has a vertical tracking timeline
(Created→Approved→Ordered→Received) with colored dots and dates — similar to
Amazon's package tracking.

**Why this is valid**: This is BETTER than the research's generic
recommendation. For a PO, the status flow IS the most important visual — users
want to know "where is this PO in its lifecycle?" The timeline answers that
instantly and is more intuitive than a status chip alone.

### A4. NavSheet (3-dot overflow) instead of a "More" tab

**Research says**: Use 5 tabs max, with the 5th being "More" for secondary
destinations.

**What's built**: The 3-dot menu opens a `NavSheet` — a bottom sheet with
grouped navigation links organized by module (Procurement, Stock, Real Estate,
Construction, Safety, Reports). It's a sitemap, not a simple "More" list.

**Why this is valid**: The NavSheet is a hybrid between a hamburger menu and a
"More" tab. It's discoverable (3-dot icon is learned quickly), it groups links
by domain, and it doesn't waste a tab slot. The risk (from research) is that
users won't open it — but the persona-adaptive tabs already surface the top 4-5
destinations, so the NavSheet is only for secondary navigation, which is the
right place for a sitemap pattern.

---

## The 7 True Gaps (Ranked by Impact)

These are genuinely missing or broken, and matter for real-world use.

### GAP 1: No pagination on any list page (HIGH IMPACT)

**Finding**: Every list page uses `take: N` (ranging from 40 to 200) with NO
"load more" button, no infinite scroll, and no pagination controls. Once a
list exceeds the `take` limit, items are silently cut off.

**Evidence** (from grep of all `/m/` pages):
- `/m/procurement/page.tsx` → `take: 60`
- `/m/dprs/page.tsx` → `take: 40`
- `/m/materials/page.tsx` → `take: 200`
- `/m/transfers/page.tsx` → `take: 100`
- `/m/sales/page.tsx` → `take: 50`
- `/m/requisitions/page.tsx` → `take: 60`
- No page has a "Load More" button or cursor-based pagination

**Why it matters**: A construction company will generate 100+ POs, 500+ DPRs,
and 1000+ stock movements within a year. Users will silently lose access to
older records. This is the NetSuite anti-pattern ("I scroll through 12,000 part
numbers") in reverse — the user doesn't even know items are missing.

**Fix**: Add a "Load More" button at the bottom of each list that fetches the
next batch using cursor-based pagination (Prisma `cursor` + `skip: 1`). The
`virtualized-list.tsx` component already exists — wire it up. Alternatively,
add a date-range filter so users can narrow to recent records.

### GAP 2: `useSmartDefaults` hook built but not wired to any form (HIGH IMPACT)

**Finding**: The `useSmartDefaults` hook exists at
`/lib/use-smart-defaults.ts` (96 lines, fully functional — records last-used
values per form type in localStorage and pre-fills them on next visit). But
NO form component imports or uses it. The PO form, transfer form, requisition
form, and equipment form all start with blank/first-item defaults.

**Evidence**:
```
grep useSmartDefaults → 3 matches, ALL in the hook file itself
```
No form file imports `useSmartDefaults`.

**Partial mitigation**: The PO form DOES auto-fill unit cost from last
purchase price (L154-187) and GST rate from material master (L160). These are
field-level smart defaults. But the form-level defaults (last supplier, last
scope, last project, last location) are NOT pre-filled.

**Why it matters**: A store keeper creating 10 POs/day has to re-select the
same supplier, scope, and location every time. Pre-filling from last-used
values saves 4 taps per form × 10 forms/day = 40 taps/day. This is the
highest-ROI form feature per the research (§3.5).

**Fix**: In `MobileNewProcurementClient.tsx`, import `useSmartDefaults("po")`,
call `getDefault("supplierId")` etc. on mount, and `recordDefaults({ supplierId,
scope, projectId, locationId })` on submit. Show the `SmartDefaultsBadge` when
defaults are applied. Same pattern for transfer, requisition, and sale forms.

### GAP 3: Detail page action bar is inline, not sticky bottom (MEDIUM IMPACT)

**Finding**: `MobilePoActions` renders as inline content at the bottom of the
page (`space-y-2 px-4 pb-6 pt-3`), NOT as a sticky bottom bar. Users must
scroll to the very bottom of a long detail page to find the Approve/Order/Cancel
buttons.

**Evidence**: `mobile-po-actions.tsx` L82:
```tsx
<div className="space-y-2 px-4 pb-6 pt-3">
```
No `fixed`, no `sticky`, no `ActionBar` from primitives.

**Why it matters**: The research (§5.1) is clear — the primary action must
always be in the thumb zone (sticky bottom bar). A PO detail page with 10 line
items, 3 receipts, charges, and a tracking timeline is 5+ screen-lengths tall.
The Approve button at the bottom requires scrolling past all of that. On a
construction site with one hand, this is friction.

**Fix**: Wrap `MobilePoActions` in the `ActionBar` component from
`primitives.tsx` (L173-182), which is already built as a fixed bottom bar with
backdrop blur. Add `pb-nav` padding to the detail page content so it doesn't
hide behind the action bar.

### GAP 4: Text sizes on list cards are too small for outdoor use (MEDIUM IMPACT)

**Finding**: The PO card uses extremely small text:
- PO number: `text-[0.5625rem]` = **9px**
- Status label: `text-[0.4375rem]` = **7px**
- Delivery text: `text-[0.4375rem]` = **7px**
- Progress labels: `text-[0.375rem]` = **6px**

The research (§7.2, §9.3) says 16px minimum body text for outdoor use, and
field apps should use even larger. 6-9px text is unreadable in direct sunlight,
even with high contrast.

**Evidence**: `MobileProcurementList.tsx` L330, L336, L361, L383.

**Why this is the way it is**: The 2-col card grid forces small text to fit
all the information (PO number, supplier, amount, delivery, progress) into a
card that's ~170px wide. This is the trade-off of the card-grid-over-list-rows
decision (A2).

**Fix options** (pick one):
1. Switch to a 1-col list layout for transactional lists (more width per row,
   larger text) — but this reverses the A2 decision
2. Add a "comfortable" density mode that switches to 1-col with larger text
3. Increase the minimum text sizes to 11px (text-[0.6875rem]) for primary
   content and 9px for secondary — still small but readable in sunlight
4. Add the "Outdoor Mode" toggle from the research (§7.2) that snaps to
   maximum contrast + larger text

### GAP 5: No persistent filters across navigation (MEDIUM IMPACT)

**Finding**: When a user filters the PO list to "Draft" status, navigates to a
PO detail, and comes back, the filter resets to "All". The filter state is
component-local (`useState`), not persisted in URL or sessionStorage.

**Evidence**: `MobileProcurementList.tsx` L84:
```tsx
const [statusFilter, setStatusFilter] = useState<PoStatus>("ALL");
```
Not in URL search params, not in sessionStorage.

**Why it matters**: The research (§1.4) calls this "never lose place" — a core
expectation. A manager filtering to "pending approvals", approving one, and
returning to the list should see the remaining pending approvals, not the full
list again. This causes 2-3 extra taps per approval cycle.

**Fix**: Store filter state in URL search params (`?status=DRAFT&q=supplier`)
using `useSearchParams` from `next/navigation`. Next.js will preserve these
across navigation. Alternatively, use sessionStorage keyed by page path.

### GAP 6: Offline banner uses alarming red, not subtle indicator (LOW IMPACT)

**Finding**: The offline banner uses `var(--color-stop)` (red) background with
white text — it looks like an error, not a normal mode.

**Evidence**: `mobile-shell.tsx` L427-428:
```tsx
style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
```

**Why it matters**: The research (§6.4) says offline should be a subtle
indicator (small cloud-off icon), not an alarming banner. Field workers are
frequently offline — a red banner every time they enter a dead zone creates
anxiety and "error fatigue". The offline queue is working correctly (the
architecture is sound), but the UI treatment is wrong.

**Fix**: Change the banner to a subtle amber/neutral indicator
(`var(--color-signal-wash)` background, `var(--color-signal-dark)` text) with
a small `WifiOff` icon. Keep the queue count + sync link. Remove the
full-width banner — make it a thin strip (py-1) or just an icon in the header.

### GAP 7: Filter chips below 44px touch target minimum (LOW IMPACT)

**Finding**: `MobileFilterChips` uses `min-h-9` = 36px, which is below the
44px Apple HIG minimum and the 48px Material recommendation.

**Evidence**: `scaffold.tsx` L165:
```tsx
className="press rounded-full px-3.5 min-h-9 shrink-0 ..."
```

**Why it matters**: The research (§8.1) found that target separation and size
both affect mistap rate. 36px chips with 6px gap (`gap-1.5`) will have a higher
mistap rate than 44px chips with 12px gap, especially with gloves.

**Fix**: Change `min-h-9` to `min-h-11` (44px) on filter chips. The horizontal
scroll container already has `gap-1.5` (6px) — increase to `gap-2` (8px) for
better separation.

---

## What Does NOT Need Doing (Common Assumptions That Are Wrong)

These are things the research doc or mega plan suggested, but the codebase
audit shows they're either already done or not needed:

| Item | Status | Why |
|---|---|---|
| Bottom tab bar | ✅ Done | 7-persona adaptive tabs already built |
| Search-first nav | ✅ Done | Center tab with overlay, Linear model |
| Swipe-to-act | ✅ Done | On PO list, with haptic + long-press alternative |
| Long-press context menu | ✅ Done | `InteractiveListItem` wraps both patterns |
| Empty states | ✅ Done | `MobileEmptyState` with icon + hint + CTA |
| Error boundaries | ✅ Done | Module-level `error.tsx` with retry + home |
| Skeleton loading | ✅ Done | Home + detail skeleton variants |
| Draft auto-save | ✅ Done | `useDrafts` on PO form |
| Offline queue | ✅ Done | `useOfflineQueue` with sync + badge |
| Status color consistency | ✅ Done | `statusMeaning()` → `MEANING_TO_TONE` single source |
| Cross-entity linking | ✅ Done | PO → supplier, project, requisition, material |
| Tracking timeline | ✅ Done | Amazon-style vertical timeline on PO detail |
| Export/share | ✅ Done | `MobileExportShareIcons` on list pages |
| Barcode scan | ✅ Done | `ScanButton` + `barcode-scanner.tsx` |
| Voice agent | ✅ Done | `VoiceAgentButton` in header |
| GPS attendance | ✅ Done | `mobile-attendance-form.tsx` |
| Company switcher | ✅ Done | In header for OWNER/ADMIN |
| Recent items | ✅ Done | Carousel on home page |
| Pull-to-refresh | ✅ Done | With progress indicator |
| Edge-swipe back | ✅ Done | With visual chevron |
| FAB | ✅ Done | Standardized in scaffold |
| No-access state | ✅ Done | `MobileNoAccess` for role-gated pages |

---

## Recommended Priority Order

If you're going to fix the 7 gaps, do them in this order:

1. **GAP 2** (Smart defaults not wired) — highest ROI, lowest effort. The hook
   is built, just needs importing + 5 lines per form.
2. **GAP 1** (No pagination) — highest user impact for growing datasets. Add
   "Load More" button to the 5 most-used lists (POs, DPRs, transfers, sales,
   requisitions).
3. **GAP 3** (Action bar not sticky) — medium effort, high UX impact. Wrap
   `MobilePoActions` in `ActionBar` + apply same pattern to other detail pages.
4. **GAP 5** (Filters not persistent) — medium effort, medium impact. Move
   filter state to URL search params.
5. **GAP 4** (Text too small for outdoor) — design decision needed (density
   mode vs. larger text vs. outdoor mode). Not a quick fix.
6. **GAP 6** (Offline banner alarming) — quick fix, low impact. Change color
   from red to amber.
7. **GAP 7** (Filter chips too small) — quick fix, low impact. Change min-h-9
   to min-h-11.

---

## Summary

The mobile app is **genuinely well-built** and ahead of the research in several
areas. The architecture decisions (orbit navigator, persona tabs, tracking
timeline, voice agent, offline queue) are sound and original. The 7 true gaps
are mostly wiring issues (smart defaults hook exists but isn't connected,
pagination isn't implemented, action bar isn't sticky) rather than fundamental
design problems. Fixing gaps 1-3 would bring the app from its current state to
production-ready for daily field use.
