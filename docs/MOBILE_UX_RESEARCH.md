# Mobile UX Research — World-Class Patterns, Density Design & Anti-Patterns

> **Purpose**: The authoritative reference for designing Nirman's mobile UI/UX —
> navigation, density, forms, dashboards, field-worker constraints, and the
> anti-patterns to avoid. Grounded in real app examples, App Store review themes,
> and academic research. Use alongside `docs/MOBILE_FLOW_MAP_BRAINSTORM_V2.md`
> (which has the Nirman-specific scorecard and 12 principles).
>
> **Last updated**: 2026-08-25 · Sources: web research + existing competitor map +
> App Store review analysis + NN/g + Android/Material 3 guidelines.

---

## Table of Contents

1. [Navigation Architecture](#1-navigation-architecture)
2. [Information Density & Layout](#2-information-density--layout)
3. [Form Design on Mobile](#3-form-design-on-mobile)
4. [Dashboard & Glanceable Design](#4-dashboard--glanceable-design)
5. [Detail Page Architecture](#5-detail-page-architecture)
6. [States: Empty, Loading, Error, Offline](#6-states-empty-loading-error-offline)
7. [Field-Worker & Outdoor Constraints](#7-field-worker--outdoor-constraints)
8. [Touch Targets & Gestures](#8-touch-targets--gestures)
9. [Color, Contrast & Typography](#9-color-contrast--typography)
10. [Construction-Specific Mobile UX](#10-construction-specific-mobile-ux)
11. [Anti-Patterns & What Users Hate](#11-anti-patterns--what-users-hate)
12. [The Nirman Design Decisions](#12-the-nirman-design-decisions)

---

## 1. Navigation Architecture

### 1.1 The bottom tab bar wins (decisively)

**The research is unambiguous.** A 20-participant usability study (DIVA, Sweden)
measured hamburger menu vs bottom bar for 3-level navigation. Result: bottom bar
is **more efficient in total completion time** AND **perceived better by users**.
Hoober's touchscreen heat-map research (thousands of users) found bottom-positioned
navigation receives **70–80% of all navigation taps** even when alternative nav
(top bars, side drawers) is present. Apps optimizing for thumb zones report
**30–40% reduction in accidental taps** and **25–35% faster task completion**.

**Why**: 75% of users hold phones one-handed with the thumb as primary input
(Hoober 2013). The bottom third of the screen achieves 95%+ comfortable reach;
the top third drops to 25% one-handed comfort. The thumb-zone is not a preference
— it's ergonomics.

**Material 3 Expressive (May 2025) doubled down**: Google deprecated the
navigation drawer on phones and brought back shorter bottom bars. The "flexible
navigation bar" is now the recommended primary nav for compact screens. Drawers
are relegated to large screens (foldables/tablets) via the navigation rail.

| Pattern | Reach | Discoverability | Tap share | Use when |
|---|---|---|---|---|
| Bottom tab bar (3–5 tabs) | Excellent (thumb zone) | High (always visible) | 70–80% | Primary nav, ≤5 top destinations |
| Hamburger / side drawer | Poor (top-left) | Low (hidden) | <15% | Deprecated for primary nav |
| Top tab bar | Medium (2-handed) | High | Moderate | Secondary nav within a screen |
| Search-first (Linear/Notion) | Excellent (overlay) | Learned | High after adoption | Deep hierarchies, power users |

### 1.2 How many tabs, and what goes in them

**Rule**: 3–5 primary tabs, equal importance, one-tap switch. Never more than 5 —
cognitive load + accidental taps on adjacent tabs spike. Material 3 and Apple HIG
both cap at 5.

**Linear's evolution (instructive)**: Linear Mobile started with a bottom toolbar
that showed nav tabs + a "new issue" action. When you drilled into a screen, the
tabs disappeared and the bar showed only view-specific actions + back. This broke
down as the product grew — there was no fast way to jump across sections, users
backtracked constantly. The fix: a **persistent search control in the bottom
toolbar** that opens a lightweight overlay (recent items + semantic search across
the whole workspace). Search became the universal jump point. Later (iOS 26
redesign), Linear moved to a **4-tab bar with a dynamic 4th position** — tap the
chevron to expand and reorder tabs so your core workflow sits front and center.
Role-based tab customization.

**The lesson for Nirman**: a fixed 5-tab bar (Home, Inventory, Search, Site, More)
is the right starting point, BUT the 4th or 5th position should be
persona-adaptive. A store keeper's 4th tab is "Transfers"; a site engineer's is
"DPR"; a sales manager's is "Customers". This is the Linear pattern — same shell,
different muscle memory per role.

### 1.3 Search-first navigation (the Linear/Notion model)

Linear made search the primary navigation on mobile. Tapping the search tab opens
a full-screen overlay: recent items at top, results as you type, semantic
(embedding-powered) search across the entire workspace. You can jump from anywhere
to any issue, project, or list without backtracking.

**When search-first wins**: deep hierarchies (Nirman has 15+ entity types), power
users who know what they're looking for, and "I was just looking at this PO
yesterday" moments.

**When it fails**: first-time users who don't know what entities exist (they need
to browse), and entity discovery ("what projects do we have?"). The fix: show
recent + suggested destinations when the query is empty, so search doubles as a
"jump back in" surface.

**Nirman status**: Global Search (mega plan §1.1) is already built and wired as
the center tab. This is correct and aligns with Linear's proven model.

### 1.4 "Never lose place" — back navigation and resume

The best apps preserve: scroll position, selected tab, filter state, and form
input across navigation. Linear, Notion, and Procore (bookmarks) all implement
this. The pattern:

- **Recent items** surface (home page + search empty state) — "jump back in"
- **Persistent filters** — if you filtered the PO list to "pending" and navigated
  away, returning should still show "pending"
- **Form draft auto-save** — never lose typed data to a back gesture or app
  switch (Nirman has this via `useDrafts`, mega plan §1.7)
- **Scroll restoration** — returning to a list should land at the same row, not
  the top

**Nirman status**: Recent items (§1.2) ✅, auto-save drafts (§1.7) ✅. Scroll
restoration and persistent filters are NOT yet implemented — these are real
friction points for list-heavy workflows.

### 1.5 Gesture navigation

| Gesture | Universal? | Risk |
|---|---|---|
| Edge swipe → back | Yes (iOS/Android native) | Conflicts with in-card swipe-to-act |
| Pull-to-refresh | Yes | Destroys scroll position if not restored |
| Long-press → context menu | Learned (not intuitive) | Conflicts with iOS text-selection |
| Swipe-left on list row → actions | Common (Mail, WhatsApp) | Accidental triggers on narrow rows |
| Pinch-to-zoom | Universal | Rarely needed in business apps |

**The Procore lesson (from App Store reviews)**: "swiping up for different
versions should be able to be disabled" — gesture conflicts with content
navigation are a top complaint. Procore's drawing version swipe interferes with
normal scrolling. **Rule**: never overload a gesture that the OS already uses for
navigation. Swipe-to-act on list rows is fine (horizontal), but vertical swipes
inside content should always scroll.

**Nirman status**: `SwipeableListItem` (mega plan §2.2) uses horizontal swipe —
correct. Long-press context menu (§2.1) is wired. No gesture conflicts observed.

---

## 2. Information Density & Layout

### 2.1 The density renaissance — minimalism is over

The products gaining ground in 2026 — Notion, Linear, Superhuman, Stripe — share
something counterintuitive: they pack MORE information per screen while staying
legible. This is **intentional density**, not clutter. The difference is
**information hierarchy**: size, contrast, position, and weight guide the eye so
users know where to look without thinking. Elements aren't removed; they're
arranged.

NN/g research shows minimalist interfaces can **increase cognitive strain** when
users must navigate multiple levels to find information. Density, when structured
correctly, reduces strain — users see what they need without hunting. Power users
don't want simplicity; they want speed. Dense, information-rich screens reduce
clicks and page loads. For users who live in the product, that efficiency
compounds.

**The rule**: dense doesn't mean cramped. It means **every pixel earns its place
through hierarchy**. A PO list row that shows PO number, supplier, amount, status,
and date in a scannable hierarchy is dense AND clear. A row that shows the same
data with no visual priority is just noise.

### 2.2 List vs card vs table — when each wins

| Layout | Scannability | Density | Mobile UX | Best for |
|---|---|---|---|---|
| **Compact list** | Excellent (compare rows) | High | Easy | Many records, shallow attributes, comparison tasks |
| **Rich card** | Poor (can't compare) | Low | Easy | Rich varied content (photo + text + status), small sets |
| **Table** | Excellent (cross-record) | Highest | Hard | Many records, many attributes, column comparison |

**For Nirman's lists**: POs, requisitions, transfers, sales, DPRs → **compact
list rows** with 3-level hierarchy per row (primary: number + amount, secondary:
supplier/customer, tertiary: date + status chip). NOT cards (too sparse for
50+ item lists) and NOT tables (horizontal scroll on mobile is a failure mode).

**For Nirman's entities with photos**: equipment, materials (with images), land
parcels → **rich cards** work because the visual aids identification.

**The mobile table rule**: if you must show tabular data on mobile, use one of
these strategies (from the data-table UX research):
1. **Card-per-row** — each row becomes a mini-card with label:value pairs
2. **Freeze first column + horizontal scroll** — only when column comparison is
   truly essential (rare on mobile)
3. **Stack vertically with sticky header** — the row label stays pinned while
   you scroll through its attributes

Never shoehorn a desktop table onto mobile with horizontal scroll. Procore and
Buildertrend both get 1-star reviews for this.

### 2.3 Progressive disclosure — the 3-tier model

The proven pattern (Oura, Apple Health, Stripe, Notion):

```
TIER 1: GLANCE (0–2 sec)     Color dot + number + status label
TIER 2: CARD (2–10 sec)      Headline + metric + 1-3 supporting details
TIER 3: DETAIL (on demand)   Full chart + breakdown + actions
```

**Cardinal rule**: never put Tier 3 content at Tier 1. A dashboard that shows a
full chart when you need a glanceable number is as broken as a detail page that
hides the breakdown.

**Notion's database row expansion** is the model: summary in the table (Tier 1),
tap a row → full record opens (Tier 3). No intermediate friction.

**Stripe's dashboard**: KPI cards are Tier 1 (big number + delta). Tap any card →
Tier 2 (time-series chart + filters). Tap a data point → Tier 3 (transaction
list + export). Each layer is one tap deeper, never more.

**For Nirman**: the home dashboard should be Tier 1 (3–5 KPI cards: pending
approvals, low-stock count, today's DPRs, cash position). Tap any → Tier 2 (the
list behind that number). Tap an item → Tier 3 (the entity detail). This is
already partially built but the layers aren't cleanly separated.

### 2.4 Density modes — let the user choose

The data-table research is clear: ship compact, comfortable, and spacious as real
options. An analyst and a casual user want different row heights. A site engineer
in bright sun wants spacious (bigger touch targets); a manager in the office
wants compact (more rows visible).

**For Nirman**: a density toggle (compact/comfortable) in settings, defaulting to
comfortable on mobile (thumb-friendly) and compact on desktop (scannability).
This is a low-effort, high-satisfaction feature.

---

## 3. Form Design on Mobile

### 3.1 Wizard vs long scroll vs hybrid — the decision matrix

| Factor | Single-page | Multi-step wizard | Hybrid (accordion) |
|---|---|---|---|
| Field count | <8 fields | >10 fields, branching | 8–15 fields, sections |
| User type | Power user (repeats daily) | New/occasional user | Mixed |
| Device | Desktop-heavy | Mobile-heavy | Both |
| Validation | Simple, field-level | Complex, cross-field | Medium |
| Risk | Low stakes | High stakes (review step) | Medium |

**The data**: multi-step forms can convert **86% higher** on mobile (Reform.app
research). Baymard Institute found well-implemented multi-step checkouts
outperform single-page on mobile because they improve scannability, allow focused
validation, and make error recovery easier. NN/g: wizards help when tasks are
complex, require decisions, or benefit from guidance.

**BUT**: power users who fill the same form daily are **frustrated** by wizards
(the extra clicks and page transitions create friction). For them, offer a
single-page "power mode" or skip the wizard entirely.

**The hybrid pattern (TurboTax / modern checkout)**: single-page layout with
accordion sections — user sees all sections at once but can only edit one at a
time. Combines the visibility of single-page with the chunking of a wizard. This
is the best default for Nirman's medium-complexity forms (PO, sale, transfer).

### 3.2 The conversation form pattern

One question at a time, like a chat. Feels less like data-entry, more like a
dialogue. Best for: mobile-first, onboarding, high-drop-off forms, conditional
logic. Hides total length (can help or hurt — some users feel anxious not knowing
how many steps remain).

**For Nirman**: the PO form (supplier → scope → location → lines → review) is a
natural 5-step wizard for first-time/occasional users. But the store keeper who
creates 10 POs/day needs the single-page power mode. **Solution**: default to
wizard on mobile, offer "switch to classic form" toggle, remember the preference.

### 3.3 Mobile form best practices (from Zuko + Reform + NN/g)

1. **Single-column layout** — never multi-column on mobile (<768px)
2. **Labels above inputs** — not inside (placeholder-as-label fails on review)
3. **3–5 fields per screen** in wizard mode
4. **Sticky bottom bar** with Next/Submit — always in thumb zone
5. **Progress cue** — "Step 2 of 4" or a progress bar (reduces anxiety)
6. **Save between steps** — never lose data on back gesture
7. **Right input types** — `type="tel"` for phone, `type="date"` for dates,
   `type="number"` for quantities (triggers the right keyboard)
8. **Radio buttons > dropdowns** for ≤5 options (one tap vs two + scroll)
9. **Smart defaults** — pre-fill from GPS, last entry, project context
10. **Inline validation** — validate on blur, not on submit (but not too early —
    validating before the user finishes typing is annoying)
11. **44–48px touch targets** — never smaller, 16px spacing between
12. **No dropdowns for common options** — use segmented controls or radio sheets

### 3.4 The dropdown anti-pattern on mobile

Dropdowns are the worst mobile input: tap to open → scroll to find → tap to
select → tap to confirm. 4 taps minimum. For ≤5 options, use **radio buttons** or
**segmented controls** (1 tap). For >5 options, use a **searchable bottom sheet**
(not a native `<select>` which renders differently on every platform).

**For Nirman**: the scope selector (COMPANY/PROJECT) is a perfect segmented
control, not a dropdown. The supplier selector (potentially 50+ items) should be
a searchable bottom sheet with recent + favorites at top.

### 3.5 Smart defaults — the highest-ROI form feature

Pre-filling fields from context eliminates typing (the #1 mobile friction).

| Field | Default source |
|---|---|
| Project | GPS location → nearest project (mega plan §2.7) |
| Date | Today |
| Supplier | Last supplier used for this material |
| Location | User's default warehouse / current project site |
| Scope | Last scope used (COMPANY vs PROJECT) |
| Expected date | Today + standard lead time for this material |
| Unit price | Last purchase price for this material (transcript §1.1) |
| Quantity | Reorder point × 2 (if creating from a low-stock alert) |

**Nirman status**: `useSmartDefaults` hook + `SmartDefaultsBadge` component are
built (mega plan §2.5) but NOT yet wired to forms. This is the highest-ROI
remaining mobile task.

---

## 4. Dashboard & Glanceable Design

### 4.1 The hero number principle

The best mobile dashboards don't try to show everything. They lead with **one
hero number** — the metric the user cares about most — and make everything else
secondary. The hero metric should be **2–3x larger** than supporting numbers.
Color only the delta (green/red for change) to draw the eye.

**Examples**:
- **Stripe**: today's revenue is the hero, everything else is a tap away
- **Apple Health**: today's steps as a huge ring, details below
- **Oura**: sleep score as a single number, contributors on tap

**For Nirman**: the hero number depends on the role:
- OWNER/ADMIN: cash position OR pending approvals count
- PROJECT_MANAGER: today's DPRs submitted / pending
- STORE_KEEPER: low-stock alerts count
- SALES_MANAGER: units sold this month / pending payments

A single hero number + 3–4 secondary cards is the right density for the home
screen. NOT a wall of 12 metrics.

### 4.2 The 3-tier glanceable model (revisited for dashboards)

```
TIER 1 (0–2 sec): Hero number + 3-4 KPI cards (color dot + number + label)
TIER 2 (2–10 sec): Tap a card → list behind that number
TIER 3 (on demand): Tap an item → full entity detail
```

**Each KPI card** should be:
- Self-contained (one metric per card)
- Max 2–3 data points (a card with 8 numbers is a table in disguise)
- Consistent height within a row (visual rhythm)
- Tappable → drill to the list behind it
- Individually loading (skeleton per card, not a full-screen spinner)

### 4.3 The morning briefing pattern

The "morning briefing" is a proven pattern (RepBud, Oura, Plume, Linear's inbox):
the first thing you see when you open the app is a **glanceable summary of what
needs attention today** — not a generic dashboard.

**What goes in a morning briefing for Nirman**:
- Pending approvals waiting on YOU (count + tap to batch-approve)
- Low-stock alerts triggered overnight
- DPRs submitted by your team awaiting your review
- Payments due today / overdue
- Deliveries expected today (POs with expected date = today)

**Format**: a single scrollable screen, each item is one line with an icon + count
+ tap-to-act. Max 5–7 items. Refreshes on pull-to-refresh. This is the home screen
for managers; field workers see their attendance + DPR + tasks instead.

**Nirman status**: the home page has an "attention banner carousel" (mega plan
§2.4 snooze) which is close to this pattern but not role-personalized. The
morning briefing (mega plan §3.2) is planned but not built.

### 4.4 Quick actions — the most-used action up front

The action users take most frequently after opening the app is what the dashboard
quick actions should surface — **it is rarely the action the team assumed**
(Checklist Design research). Measure this with analytics, don't guess.

**For Nirman by role**:
- STORE_KEEPER: "New Transfer", "Stock Count", "Issue Material"
- SITE_ENGINEER: "New DPR", "Request Material", "Log Attendance"
- SALES_MANAGER: "New Sale", "Record Payment", "Add Customer"
- OWNER: "Approve", "New PO", "View Reports"

These should be 2–3 large thumb-friendly buttons at the bottom of the home
screen, above the tab bar. NOT buried in a FAB menu.

### 4.5 What NOT to do on dashboards

- **Don't show 10+ metrics** — a dashboard that answers 10 questions answers none
- **Don't use full charts on the dashboard** — use sparklines (tappable to expand)
- **Don't show the same data in multiple widgets** — confusing, not helpful
- **Don't make the user scroll to find the important number** — hero goes first
- **Don't show a full-screen spinner** — per-widget skeletons, the dashboard
  never "partially loads in a confusing way"
- **Don't show "top performers" that are actually loss-making** (Nirman
  TESTING_FINDINGS #2 — this is a real bug in the current home page)

---

## 5. Detail Page Architecture

### 5.1 The header + sticky action bar pattern

The proven mobile detail page structure (Procore, Linear, Stripe):

```
┌─────────────────────────────┐
│ ← Back          ⋯ (overflow) │  ← sticky top bar
├─────────────────────────────┤
│  ENTITY NUMBER (hero)        │  ← big, bold
│  Supplier / Customer name    │  ← secondary
│  ₹ Amount          [STATUS]  │  ← amount + status chip
├─────────────────────────────┤
│  [Tab 1] [Tab 2] [Tab 3]    │  ← secondary nav (if needed)
├─────────────────────────────┤
│  ...scrollable content...    │
│  Lines, payments, history    │
│  Related entities            │
│  Documents                   │
├─────────────────────────────┤
│  [Primary Action]  [Secondary]│  ← sticky bottom action bar
└─────────────────────────────┘
```

**Key principles**:
- **Sticky bottom action bar** — the primary action (Approve, Receive, Edit) is
  always in the thumb zone, never at the bottom of a long scroll
- **Status as a chip** — color-coded, changes with state, always visible in header
- **Overflow menu (⋯)** for secondary actions (Print, Share, Cancel, Delete) —
  not crowding the action bar
- **Tabs for multi-section details** — if a detail page has >3 sections (lines,
  payments, history, documents), use scrollable tabs at the top, not one
  infinitely long scroll

### 5.2 Related-entity linking

Procore's App Store reviews specifically complain: "you can't see what equipment
it is linked to — you have to add the unit tag number in the observation or use
the online version." **Cross-entity linking is essential**. Every detail page
should surface its relationships as tappable links:

- PO detail → link to requisition it came from, goods receipts, supplier page
- Sale detail → link to customer, asset (unit/land), payment schedule, broker
- DPR detail → link to project, attendance records, materials consumed
- Land detail → link to project (if built on), parcels (if partitioned), sales

**Nirman status**: mega plan §1.6 (Fix Dead-End Navigation Links) addressed some
of this. Equipment→Project, Transfer→locations, DPR→project are wired. But
Sale→customer/asset/broker and PO→requisition/GRN links need verification.

### 5.3 The "no dead ends" rule

Every detail page must answer: **"what do I do next?"**

- After viewing a pending PO → "Approve" or "Reject" (in the action bar)
- After viewing a delivered PO → "Receive Goods" or "View GRN"
- After viewing an approved sale → "Record Payment" or "Upload Registry Doc"
- After viewing a low-stock material → "Create Requisition" or "View POs"

If a detail page has no action, it's a dead end. The action bar should still show
contextual options (Edit, Share, Print, Link to...). A page with no action bar
feels broken.

---

## 6. States: Empty, Loading, Error, Offline

### 6.1 Empty states are onboarding, not blank screens

The best apps treat empty states as **teachable moments** — they explain what this
screen will show once there's data, and give a one-tap path to create the first
item.

**Good empty state**:
```
    📦
No purchase orders yet
Create your first PO to start
procuring materials.

    [ + New Purchase Order ]
```

**Bad empty state**: a blank screen with "No data" or just an empty table header.

**For Nirman**: every list page needs a purpose-built empty state with:
- An icon (relevant to the entity)
- A one-line explanation of what this screen is for
- A primary CTA button to create the first item
- (Optional) a "learn more" link or a sample/demo item

### 6.2 Loading states — skeletons, not spinners

**Skeletons** (grey placeholder shapes that match the final layout) feel 30%
faster than spinners (NN/g research). They set expectations for what's coming.
Spinners feel like the app is "thinking" — anxiety-inducing.

**Rules**:
- Use skeletons for list pages and card layouts (match the row/card shape)
- Use spinners only for quick actions (<1 second) like a button tap
- **Never** use a full-screen spinner for a dashboard — use per-widget skeletons
- Show stale data immediately (from cache) with a subtle "refreshing..." indicator
  rather than blanking the screen

### 6.3 Error states — actionable, not generic

**Bad**: "Something went wrong" with no retry button.
**Good**: "Couldn't load purchase orders. Check your connection and try again."
with a [Retry] button.

**Rules**:
- Always offer a retry action for network errors
- Show the error in context (near the widget that failed), not a full-screen
  replacement
- Use plain language, not technical jargon ("Database connection timeout" →
  "We couldn't reach the server")
- For 403 errors, explain what permission is needed, not just "Forbidden"
- Log the technical error for debugging, show the friendly version to the user

### 6.4 Offline state — normal, not an error

Offline is a **normal mode** for field apps, not an error state. The best
construction apps (Fieldwire, Procore) let you work fully offline and sync later.

**UI treatment**:
- Subtle indicator (a small cloud-off icon in the header, not a banner)
- Cached data shown immediately with a "last synced 2h ago" timestamp
- Actions queue locally with a "pending sync" badge on the item
- When connectivity returns: sync automatically, show a brief "synced" toast
- **Never** block the user from reading cached data because they're offline

**Nirman status**: the app has a service worker + offline drafts (mega plan
§1.7). Full offline-first (reading cached data, queue-and-sync) is Phase 4 (§4.1).
The current offline UX is "error" not "normal" — this needs to shift.

---

## 7. Field-Worker & Outdoor Constraints

### 7.1 The environment changes everything

Construction field apps are used in conditions that invalidate standard mobile
design assumptions (from affective.com field research + SmartQHSE + FieldSpartan):

| Condition | Office app assumption | Field reality | Design response |
|---|---|---|---|
| Hands | Clean, bare fingers | Gloves, wet, cement dust | 60×60px min touch targets (not 44) |
| Light | Office lighting | Direct sunlight, noon | High-contrast theme, auto-switching |
| Attention | Focused | Split (watching work, talking) | One-tap actions, no multi-step gestures |
| Connectivity | WiFi/4G | Dead zones, basements, remote sites | Offline-first, queue-and-sync |
| Time | Leisurely | Rushed, task-switching | Speed > polish, get it done fast |
| Device | Latest iPhone | Mixed, older Androids | Performant on low-end, no heavy animations |

### 7.2 Sunlight readability — the #1 field complaint

From field-app design research: "light grey text on white backgrounds? Good luck
reading that in direct sunlight at midday." This is the most common field-worker
complaint. Design responses:

- **High-contrast mode** (auto-switching based on ambient light sensor, or manual
  toggle) — black text on white, not grey-on-white
- **Larger fonts** (16–18px minimum body text, not 14px)
- **Status colors that survive sunlight** — avoid yellow-on-white (invisible),
  use filled chips with strong borders
- **Avoid subtle shadows and gradients** — they wash out in bright light; use
  solid borders instead
- **Test in real conditions** — "tested on real job sites, not in a Figma file"
  (FieldSpartan's tagline, and it resonates)

**For Nirman**: the "Warm Industrial" design system (AGENTS.md) uses warm
neutrals which are good for this. But the current text contrast may be too low
for outdoor use. An "Outdoor Mode" toggle (high-contrast, larger touch targets,
simplified layout) would be a differentiator.

### 7.3 Glove-friendly touch targets

Standard: 44×44px (Apple HIG). Field-app standard: **60×60px minimum, 72×72px
for primary actions, 16px spacing between adjacent buttons** (affective.com
field research). Gloves add ~20mm to fingertip width; a 44px (7mm) target is
unusable with gloves.

**For Nirman**: primary action buttons (Submit, Approve, Save) should be 56–60px
tall on mobile. List rows should be minimum 56px tall (comfortable density mode).
The current 44px minimum is fine for office use but not for field use.

### 7.4 One-handed operation

Field workers often hold equipment in one hand and the phone in the other. Every
core action must be reachable with one thumb:

- Primary actions in the bottom 1/3 (thumb zone)
- Navigation in the bottom tab bar
- Avoid top-right action buttons (require hand shift)
- Avoid two-finger gestures (pinch, two-finger swipe)
- Support voice input as an alternative to typing

---

## 8. Touch Targets & Gestures

### 8.1 The 44px rule is incomplete

The 44px (Apple) / 48px (Material) / 24px (WCAG) rules are **minimums for isolated
controls**. Real-world tap accuracy depends on target size, **spacing between
targets**, position relative to the holding hand, and the gesture vocabulary.

**The spacing finding (72Technologies audit)**: a checkout flow where every button
met 44pt had an 11% mistap rate on adjacent buttons ("Apply discount" / "Remove
discount" were 44pt tall and 4pt apart). Increasing spacing to 12pt dropped
mistaps to 2%. **Target separation has a larger effect on error rate than target
size.**

**The MIT Touch Lab data**: average fingertip = 16–20mm, thumb pad = 25mm. A 44pt
target on a modern iPhone is ~7mm. The guideline isn't "a thumb fits" — it's "a
thumb fits if you aim well."

**Rules for Nirman**:
- Minimum 48×48px touch targets (Material standard, slightly above Apple minimum)
- **12px minimum spacing** between adjacent actionable elements
- Primary action buttons: 56–60px tall
- List rows: minimum 56px tall (comfortable), 48px (compact)
- Never place two action buttons closer than 12px

### 8.2 Swipe gesture research

Academic research (CHI 2024) found: **swipe operations have longer times, higher
error rates, and shifted touch points compared to taps**. Current target-size
guidelines (designed for taps) may not apply to swipe-operated targets.

**Implications for `SwipeableListItem`**:
- The swipe action area needs to be taller than a tap target (min 56px)
- Swipe should require a minimum distance threshold (not trigger on accidental
  horizontal drift while scrolling vertically)
- Provide haptic feedback when the swipe action triggers (confirms the gesture)
- Always offer a non-swipe alternative (long-press menu, button) — swipe is a
  shortcut, not the only path

### 8.3 Accidental overlay dismissal (NN/g)

NN/g research found that users frequently dismiss overlays accidentally because
different apps use different dismissal methods (close button, tap-outside,
swipe-down, browser back, edge swipe). When overlays are stacked, users can't
predict whether a dismissal closes one overlay or all.

**Rules for Nirman**:
- Bottom sheets: use the drag handle + swipe-down, AND a close button
- Modals: use close button + tap-outside, NOT swipe-down (conflicts with content
  scroll)
- Full-screen overlays: use explicit close button, NOT tap-outside (there's no
  "outside")
- When overlays are stacked, always close one at a time, not the whole stack
- Never use the browser back gesture to dismiss an overlay without also showing a
  close button (users don't know back = close)

---

## 9. Color, Contrast & Typography

### 9.1 Status colors — semantic, not decorative

Status colors must be **consistent across the entire app** and **mean something**.
The worst pattern is using the same color for different states (e.g. yellow for
both "pending" and "warning" — users can't tell which is which).

**Recommended semantic palette for Nirman** (aligns with the Warm Industrial system):

| Status | Color | Usage |
|---|---|---|
| Approved / Completed / Paid | Green | PO approved, sale completed, payment received |
| Pending / Submitted / Draft | Amber/Yellow | Awaiting action, in review |
| Rejected / Cancelled / Overdue | Red | Failed, blocked, needs attention |
| Info / In-progress | Blue | Active work, neutral status |
| Hold / Reserved | Grey/Neutral | Not active, not failed |

**Rules**:
- Never use color alone — always pair with a text label or icon (accessibility:
  color blindness affects ~8% of men)
- Status chips should be filled (colored background + contrasting text), not
  outlined (outlined chips wash out in sunlight)
- One color = one meaning, app-wide. If green = "approved" on the PO list, green
  must = "approved" everywhere, not "available" on the land list

### 9.2 Contrast for outdoor use

WCAG AA requires 4.5:1 contrast for body text, 3:1 for large text. For outdoor
field use, target **7:1 (AAA)** for body text. This means:
- Black (#000) on white (#FFF) = 21:1 ✅
- Dark grey (#333) on white = 12.6:1 ✅
- Medium grey (#666) on white = 5.7:1 ⚠️ (fails AAA, marginal for outdoor)
- Light grey (#999) on white = 2.8:1 ❌ (fails even AA)

**For Nirman**: the current warm-neutral palette uses mid-tones that may fail
outoor AAA. An "Outdoor Mode" should snap to maximum contrast (near-black text
on near-white background) while keeping the warm accent for status/branding.

### 9.3 Typography on mobile

**Type scale** (from the data-table + dashboard research):
- Hero number: 32–40px, bold
- Card title: 16–18px, semibold
- Body text: 16px (never smaller than 14px on mobile)
- Caption/secondary: 13–14px, regular, lower contrast
- Status chip label: 12–13px, uppercase or medium weight

**Line height**: 1.4–1.5x for body text (readability), 1.2x for headers (density).

**Font choice**: a system font stack (SF Pro on iOS, Roboto on Android) is the
fastest and most legible. Custom fonts add load time and can render differently
across platforms. For a data-dense business app, system fonts are the right
choice — they're optimized for the platform's screen.

**For Nirman**: the current system font stack is correct. The issue is likely
size — if body text is 14px, bump to 16px for mobile. Hero numbers on the
dashboard should be 32px+ (currently may be too small).

---

## 10. Construction-Specific Mobile UX

### 10.1 What Procore gets right (and what users hate)

**Right** (from App Store + our competitor research):
- **Drawings in the bottom nav** — the #1 used tool gets a permanent slot
- **Quick Capture** — record a video on site, speak while recording, AI
  transcribes voice into the snag item's title + description. Zero typing.
- **Bookmarks** — bookmark items from 9 entity types, the "recent items" feature
- **Conversations** — in-app messaging between office and field teams

**Hate** (from 1–3 star App Store reviews):
- **"Left-side menu is GARBAGE"** — they moved from bottom toolbar to hamburger,
  users revolted. Quote: "you always have to push the whatever you call it up in
  the upper left to get rid of it. So frustrating." **Lesson: bottom nav > side
  menu. Always.**
- **Too many tools visible** — a 5-person crew scrolls past 15 tools they'll
  never use. **Lesson: persona-based tabs.**
- **Can't see linked equipment in observations** — "you have to add the unit tag
  number or use the online version." **Lesson: cross-entity linking.**
- **Screen switches too easily on swipe** — "swiping up for different versions
  should be able to be disabled." **Lesson: gesture conflicts.**
- **Search can't handle multi-line text** — "if the unit tag is on 2 different
  lines you can't look it up." **Lesson: fuzzy + tolerant search.**
- **Hidden costs** — "$12,500 + $2,500 for QuickBooks connector + $20K for full
  program." **Lesson: transparent pricing.**

### 10.2 What Fieldwire gets right

Fieldwire is the **highest-rated** construction mobile app. Key wins:
- **Sheet-first** — drawings are the home screen, not buried in a menu
- **Offline drawings** — "if a plan set is enabled on your device, no internet
  connection is needed to view" (multiple reviews cite this as the killer feature)
- **Simple navigation** — "a child could use the app"
- **Priority stages on tasks** — visual priority that's immediately scannable
- **Fast markup** — "editing is fast and updates are immediate"

**What Nirman can steal**: the offline-first promise ("your data is always
available, even with no signal") and the child-could-use-it navigation simplicity.

### 10.3 What Buildertrend gets wrong

From App Store reviews:
- **"Drop-down menu for every drop-down menu"** — nested dropdowns are the #1
  complaint. Every selection requires opening a dropdown inside a dropdown.
- **"Cannot leave the upload page even to answer a phone call without everything
  deleting itself"** — no auto-save, no background upload. **Lesson: auto-save
  drafts + resumable uploads.**
- **"Constant changes"** — "every time you get used to a new change some IT person
  has to justify their existence and create an extra step." **Lesson: stability of
  interaction patterns. Don't move buttons.**
- **"Temu version of Procore"** — perceived as a cheap imitation. **Lesson: don't
  copy competitors superficially; understand the WHY.**

### 10.4 Daily Report (DPR) submission on mobile

The best pattern (from Procore Quick Capture + our mega plan §3.3):
1. **Photo-first** — take a photo of the site, it auto-attaches to the DPR
2. **Voice-to-text** — speak the work description, transcribed automatically
3. **Auto-pull from attendance** — labor count + check-in/out times auto-filled
4. **Template-driven** — common work types pre-fill the structure
5. **One-screen submit** — not a 5-step wizard; a single screen with smart
   defaults, submit in one tap

**For Nirman**: the DPR form should auto-pull today's attendance for the
project, let the user photo-capture progress, voice-dictate notes, and submit in
one tap. This is the most-used field workflow — it must be frictionless.

### 10.5 Approval workflows on mobile

Managers approve on the go. The pattern:
- **Swipe to approve** (right), **swipe to reject** (left) — like email
- **Batch approve** — select multiple, approve all with one tap
- **Quick-reject with reason** — pre-set reasons ("Budget exceeded", "Need
  revision", "Duplicate") + custom text
- **Snooze** — "remind me tomorrow" (mega plan §2.4, in progress)
- **Approve from notification** — tap the push notification → approve without
  opening the full app

**For Nirman**: swipe-to-act (§2.2) ✅, snooze (§2.4) 🚧, batch approve (§3.7) ⬜,
push notifications (§3.4) ⬜.

---

## 11. Anti-Patterns & What Users Hate

### 11.1 The ERP mobile hall of shame (from App Store reviews)

| App | Rating | Top complaint | Lesson |
|---|---|---|---|
| **SAP Business ByDesign** | 2.6★ | "Can't get to any work centers. Have to login again every time I switch apps." | Don't re-auth on every app switch. |
| **NetSuite iOS** | 2.8★ | "No search function — I scroll through 12,000 part numbers to add to a quote." | Search is non-negotiable. |
| **NetSuite iOS** | 2.8★ | "No save button when editing a record — you edit fields but can't save." | Every form needs a visible save. |
| **NetSuite iOS** | 2.8★ | "Can't email a quote or sales order from the app." | Core actions must work on mobile. |
| **Dynamics 365** | 4.1★ (frustrated) | "Frequent crashes, have to delete and reinstall repeatedly." | Stability > features. |
| **Workday** | 4.7★ (declining) | "Check-in feature randomly disappeared after update." | Don't remove core features in updates. |
| **Buildertrend** | 4.5★ | "Upload page deletes everything if you answer a phone call." | Auto-save + resumable uploads. |
| **Procore** | 4.6★ | "Left-side menu is GARBAGE." | Bottom nav > hamburger. Always. |

### 11.2 The top 12 mobile anti-patterns to avoid

1. **Hamburger menu as primary nav** — hides everything, users can't find it,
   75% of users never open it. Use a bottom tab bar.

2. **Desktop tables on mobile** — horizontal scroll, columns that don't fit,
   tiny text. Use card-per-row or compact list rows instead.

3. **No auto-save** — losing typed data to a back gesture, app switch, or phone
   call is the #1 form frustration. Auto-save drafts (Nirman has this ✅).

4. **Full-screen spinners** — the app feels frozen. Use per-widget skeletons.

5. **Generic error messages** — "Something went wrong" with no retry. Always
   offer a retry + plain-language explanation.

6. **Mandatory fields buried at the bottom** — user fills the whole form, then
   discovers a required field they scrolled past. Show required indicators
   upfront, validate inline.

7. **No offline support** — "this app requires internet" in a dead zone is a
   dead app. Cache data, queue actions, sync later.

8. **Nested dropdowns** — "a dropdown for every dropdown" (Buildertrend review).
   Flatten selections: radio sheets, segmented controls, searchable bottom sheets.

9. **Touch targets too small or too close** — 44px targets 4px apart = 11%
   mistap rate. Use 48px+ targets with 12px+ spacing.

10. **No empty states** — a blank screen with "No data" teaches nothing. Show
    what this screen will contain + a CTA to create the first item.

11. **Forcing desktop for key actions** — "you can't do X on mobile, use the
    desktop version" (Procore, NetSuite). Every core action must work on mobile.

12. **Moving buttons between updates** — "every time you get used to it, they
    move a box to the other side" (Buildertrend review). Interaction stability
    matters more than visual freshness. Don't redesign for the sake of it.

### 11.3 The enterprise mobile trap (from UITOP + Team400 research)

The #1 mistake enterprise apps make: **shrinking the web version to fit a small
screen**. Responsive design solves the visual problem but not the contextual one
— unnecessary fields remain, complex navigation stays complex, multi-step
processes stay cumbersome. "Users get frustrated, lose data, and make mistakes.
The product loses credibility."

**Enterprise mobile UX rules** (Team400):
- **Optimize for task completion, not engagement** — enterprise users want to get
  done and get out, not "engage" with the app
- **Progressive disclosure** — show what's needed now, reveal complexity on demand
- **Offline-first mindset** — assume the network might fail, design for it
- **Error prevention > error recovery** — constrain inputs, validate early,
  confirm destructive actions
- **Scannable interfaces** — users skim, they don't read
- **Clear system status** — always show current mode, pending actions, sync state
- **Consistent patterns** — the same action looks the same everywhere
- **Don't expose every capability on mobile** — mobile should do common tasks
  well, not all tasks adequately

### 11.4 The "Micro-App" lesson (Oracle Redwood case study)

Oracle's Redwood UI migration flopped on mobile because it tried to put the full
ERP on a 6-inch screen. The fix was "Micro-Intent Apps" — surface only the
specific fields and actions a mobile user needs (2-tap PO approvals, quick leave
requests). **Don't give users the whole ERP on their phone. Give them the 5 things
they do on mobile, and make those 5 things frictionless.**

**For Nirman**: the mobile app should NOT try to replicate every desktop page.
It should excel at:
1. Approvals (swipe to approve/reject/snooze)
2. DPR submission (photo + voice + auto-attendance)
3. Attendance check-in (GPS-tagged, one tap)
4. Stock movements (scan barcode → issue/transfer)
5. Search + view any entity (read-only is fine for complex entities)

Everything else (BOQ, GL, reports, settings) stays on desktop. The mobile app is
a **field tool**, not a full ERP.

---

## 12. The Nirman Design Decisions

This section translates the research above into concrete decisions for Nirman's
mobile app. Each decision maps to evidence and to the mega plan / DECISIONS.md
backlog.

### 12.1 Navigation

| Decision | Rationale | Status |
|---|---|---|
| Bottom tab bar, 5 tabs (Home, Inventory, Search, Site, More) | §1.1 — bottom bar wins decisively | ✅ Built |
| Search as center tab (Linear model) | §1.3 — search-first for deep hierarchies | ✅ Built (§1.1) |
| 4th/5th tab is persona-adaptive | §1.2 — Linear's dynamic tab pattern | ⬜ Phase 3 |
| Persistent filters + scroll restoration | §1.4 — "never lose place" | ⬜ Phase 3 |
| Recent items on home + search empty state | §1.4 — "jump back in" | ✅ Built (§1.2) |

### 12.2 Density & Layout

| Decision | Rationale | Status |
|---|---|---|
| Compact list rows for POs, sales, transfers, DPRs | §2.2 — scannable + dense | ✅ Built |
| Rich cards for equipment, materials (with photos), land | §2.2 — visual identification | ✅ Built |
| 3-tier progressive disclosure on home dashboard | §2.3 — glance → card → detail | ✅ Partial |
| Density toggle (compact/comfortable) | §2.4 — role + environment adaptive | ⬜ Phase 3 |

### 12.3 Forms

| Decision | Rationale | Status |
|---|---|---|
| Hybrid accordion for medium forms (PO, sale, transfer) | §3.1 — visibility + chunking | ✅ Built |
| Wizard mode for new users, power mode toggle | §3.1 — power users hate wizards | ⬜ Phase 3 |
| Smart defaults (GPS, last entry, project context) | §3.5 — highest-ROI form feature | 🚧 Built, not wired (§2.5) |
| Radio sheets / segmented controls instead of dropdowns | §3.4 — 1 tap vs 4 taps | ⬜ Phase 3 |
| Sticky bottom action bar on all forms | §3.3 — thumb zone | ✅ Built |
| Auto-save drafts | §3.3 — never lose data | ✅ Built (§1.7) |

### 12.4 Dashboard

| Decision | Rationale | Status |
|---|---|---|
| Hero number + 3–4 KPI cards (role-based) | §4.1 — one hero, rest secondary | 🚧 Partial |
| Morning briefing as home for managers | §4.3 — "what needs attention today" | ⬜ Phase 3 (§3.2) |
| Quick actions (role-based, 2–3 large buttons) | §4.4 — most-used action up front | ⬜ Phase 3 |
| Per-widget skeleton loading | §4.5 + §6.2 — never full-screen spinner | ✅ Built (§2.8) |
| Sparklines on KPI cards (tappable to expand) | §4.5 — trend without full chart | ⬜ Phase 3 |

### 12.5 Detail Pages

| Decision | Rationale | Status |
|---|---|---|
| Sticky header (number + amount + status chip) | §5.1 — always-visible context | ✅ Built |
| Sticky bottom action bar (primary + secondary) | §5.1 — thumb zone actions | ✅ Built |
| Overflow menu (⋯) for secondary actions | §5.1 — don't crowd the action bar | ✅ Built |
| Cross-entity links on every detail page | §5.2 — no dead ends | 🚧 Partial (§1.6) |
| Tabs for multi-section details | §5.1 — avoid infinite scroll | ✅ Built |

### 12.6 States

| Decision | Rationale | Status |
|---|---|---|
| Purpose-built empty states with CTA | §6.1 — empty = onboarding | ✅ Built (§1.4) |
| Skeletons for list/card loading | §6.2 — feels 30% faster | ✅ Built |
| Per-widget error states with retry | §6.3 — actionable, not generic | ✅ Built (§2.8) |
| Offline as normal mode (not error) | §6.4 — field reality | ⬜ Phase 4 (§4.1) |

### 12.7 Field-Worker Constraints

| Decision | Rationale | Status |
|---|---|---|
| "Outdoor Mode" toggle (high-contrast, larger targets) | §7.2 — sunlight readability | ⬜ Phase 4 |
| 56–60px primary action buttons | §7.3 — glove-friendly | 🚧 Partial |
| GPS auto-select project (§2.7) | §7.4 — one-handed, context-aware | ⬜ Phase 2 (§2.7) |
| Photo capture on all field entities (§2.6) | §10.4 — photo-first DPR | ⬜ Phase 2 (§2.6) |
| Voice-to-text for notes/descriptions | §10.4 — zero-typing field input | ⬜ Phase 4 |

### 12.8 Touch & Gestures

| Decision | Rationale | Status |
|---|---|---|
| 48px min touch targets, 12px min spacing | §8.1 — spacing > size for mistaps | 🚧 Audit needed |
| Horizontal swipe-to-act on list rows | §8.2 — shortcut, not only path | ✅ Built (§2.2) |
| Long-press context menu as alternative | §8.2 — non-swipe path | ✅ Built (§2.1) |
| Haptic feedback on swipe/long-press trigger | §8.2 — gesture confirmation | ⬜ Phase 3 |
| Bottom sheets with handle + close button | §8.3 — predictable dismissal | ✅ Built |

### 12.9 Color & Typography

| Decision | Rationale | Status |
|---|---|---|
| Semantic status palette (green/amber/red/blue/grey) | §9.1 — one color = one meaning | ✅ Built |
| Filled status chips (not outlined) | §9.1 — survive sunlight | ✅ Built |
| 16px min body text on mobile | §9.3 — readability | 🚧 Audit needed |
| 32px+ hero numbers on dashboard | §9.3 — visual hierarchy | 🚧 Audit needed |
| System font stack | §9.3 — fastest + most legible | ✅ Built |

### 12.10 The Mobile App Scope (the Micro-App lesson)

The mobile app excels at **5 core field workflows** and does NOT try to replicate
the full desktop ERP:

1. **Approvals** — swipe to approve/reject/snooze, batch approve, push notifications
2. **DPR submission** — photo + voice + auto-attendance, one-tap submit
3. **Attendance** — GPS-tagged check-in, 5-code system, one tap
4. **Stock movements** — barcode scan → issue/transfer/receive
5. **Search + view** — any entity, read-only for complex entities

Complex workflows (BOQ editing, GL entries, report building, schema settings)
stay on desktop. The mobile app is a **field tool**, not a full ERP. This is the
Oracle Redwood "Micro-Intent App" lesson (§11.4) — don't shrink the web version,
design for the mobile context.

---

## Appendix: Source Index

| Source | Topic | Used in |
|---|---|---|
| DIVA 20-participant study (Sweden) | Bottom bar vs hamburger | §1.1 |
| Hoober touchscreen heat-map research | Thumb zones, tap distribution | §1.1, §7.4 |
| Material 3 Expressive (May 2025) | Navigation patterns | §1.1 |
| Linear Mobile case study (Gavin Nelson) | Search-first nav, dynamic tabs | §1.2, §1.3 |
| NN/g — Accidental overlay dismissal | Overlay dismissal patterns | §8.3 |
| NN/g — Wizards | Multi-step form guidance | §3.1 |
| Baymard Institute — Checkout research | Multi-step vs single-page | §3.1 |
| Zuko — Mobile form UX | Form best practices | §3.3 |
| Reform.app — Mobile multi-step forms | Form conversion data | §3.1 |
| Oura 2024 redesign | 3-tier progressive disclosure | §2.3, §4.2 |
| Checklist Design — Dashboard Mobile | Dashboard patterns | §4.2, §4.4 |
| 72Technologies — Tap targets & thumb zones | Touch target spacing | §8.1 |
| MIT Touch Lab | Fingertip/thumb dimensions | §8.1 |
| CHI 2024 — Tap vs swipe performance | Swipe gesture research | §8.2 |
| affective.com — Construction app design | Field-worker constraints | §7.1, §7.3 |
| SmartQHSE / FieldSpartan | Outdoor-first design | §7.2 |
| Builder Prime iOS offline architecture | Offline-first patterns | §6.4 |
| Dusko Licanin — Flutter offline-first 2026 | Write queue, outbox pattern | §6.4 |
| App Store reviews — Procore, Fieldwire, Buildertrend, NetSuite, SAP, Dynamics, Workday | Competitor anti-patterns | §10, §11.1 |
| Oracle Redwood Micro-Intent Apps | Enterprise mobile scope | §11.4 |
| Team400 — Enterprise mobile UX rules | Enterprise UX principles | §11.3 |
| Existing: `MOBILE_FLOW_MAP_BRAINSTORM_V2.md` | Nirman-specific scorecard + 12 principles | Cross-referenced |
| Existing: `docs/competitor-map/*` (14 files) | Detailed competitor analysis | Cross-referenced |

---

*This document is the research foundation. For Nirman-specific scorecard,
principles, and codebase-mapped improvements, see
`docs/MOBILE_FLOW_MAP_BRAINSTORM_V2.md`. For the prioritized backlog with
owner-voice-wins ranking, see `DECISIONS.md`.*
