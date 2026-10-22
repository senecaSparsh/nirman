# Pattern Library — Blinkit (mobile-first instant commerce)

> **Provenance**: assembled 2026-10-22 from public app behaviour + published
> UX analyses. Live extraction was attempted and Cloudflare-blocked for
> headless automation — capture gaps are marked [unverified]. Treat verbatim
> copy as approximate, not literal.
>
> **Why this reference**: user benchmark for "mobile app that feels
> effortless." The transferable lessons are _ordering, density and feedback_
> — not its catalogue model or visual identity.

## Contents

- [Wayfinding](#wayfinding)
- [Home & first screen](#home--first-screen)
- [Lists & density](#lists--density)
- [Actions & CTAs](#actions--ctas)
- [Feedback & state](#feedback--state)
- [Empty / error / loading](#empty--error--loading)
- [Badges & counts](#badges--counts)
- [Return-state & resumption](#return-state--resumption)
- [What NOT to copy](#what-not-to-copy)

---

## Wayfinding

- **Flat 4–5 tab bottom nav**: Home · Categories · Print · Orders · Cart.
  No drawers, no hamburger. Every destination is one tap from anywhere.
- **No nested navigation** — categories are horizontal chips, not levels.
- **Active tab**: filled icon + label tinted; inactive are outline icons.
- **Address strip at top** — the _context_ of the session ("Home — delivery
  in 8 min") sits above everything and is tappable to change.
- **ERP translation**: our personas already get 4 tabs + centre FAB — the
  pattern to keep. What's missing: the _session-context strip_ — ours shows
  the company name but not "where am I working" (project/site) as a
  one-tap context switch.

## Home & first screen

- **Status before content**: an active order gets a full-width status card
  at the very top ("rider on the way · 4 min") above the catalogue.
- **Action-first ordering**: the first scroll screen contains the most
  repeated action (re-order strip / search) — not a feed.
- **Horizontal "buy again" rail** — returning users see their most-used
  items as a swipeable row, one-tap re-add.
- **ERP translation**: an active punch session / pending approvals /
  today-at-site card should lead home before any briefing feed. (Done —
  check-in card now leads for field personas.)
- **Never a module menu**: home shows _things that need you_, not a
  directory of features.

## Lists & density

- **~3.5 items per viewport**: product cards are ~110px tall — thumb,
  name (2 lines max), weight, price, + button. Nothing else.
- **One metadata accent per row**: the _one_ thing that decides (price /
  savings % / "arriving today") gets colour; everything else is grey.
- **Horizontal overflow over vertical categories**: "Frequently bought"
  rows scroll sideways; the page only scrolls down for _more of the same_.
- **ERP translation**: our mobile lists run tighter already (p-2.5/gap-2,
  h-7 chips) but rows often carry 4-6 metadata chips where Blinkit would
  show one. Pick the _deciding_ field per list type and demote the rest.

## Actions & CTAs

- **One-tap add on every card**: `+` on each product → cart. No detail
  page required to act. `+` becomes a stepper (− N +) inline once added —
  the control _is_ the state.
- **The cart is a persistent bottom strip** above the nav once non-empty:
  "3 items · ₹341 →" — the outstanding work is always visible and one
  tap away.
- **Primary action per screen is singular and coloured**; secondary
  actions are ghost/text.
- **ERP translation**: the pending-work strip maps to our approvals badge +
  queue, but as a _floating strip_ ("2 DPRs pending review →") pinned
  above the tab bar when count > 0. Our "+ FAB" already exists.
- **Destructive actions ask once, in-line** — no modal for the common
  case; swipe-to-remove with undo toast.

## Feedback & state

- **Everything is instant or skeletoned** — every surface has a designed
  skeleton (shimmer), never a spinner-only screen.
- **Optimistic everything**: tap `+` and the cart strip + stepper update
  _before_ the network confirms; rollback on failure with a toast.
- **Toasts are single-line, action-carrying** ("Item removed — Undo"),
  never just informational.
- **Micro-delight**: the ETA countdown on the status card updates live;
  the cart icon fills on add.
- **ERP translation**: our useFetch + skeleton infrastructure covers most
  surfaces. Gaps to hunt: forms that disable-submit without a spinner,
  toasts that inform but can't undo, optimistic writes we still wait on.

## Empty / error / loading

- **Empty states always name the next action**: "Your cart is feeling
  light — Add something" with the add-CTA _in the empty state_.
- **Error states offer one retry path** — never a dead-end error card.
- **Skeleton matches the loaded layout** exactly — same card shapes,
  same row heights (no layout jump on resolve).
- **ERP translation**: our EmptyState component is shaped correctly
  (icon/desc/action). Hunt for usages missing `action`/`contactHint`.

## Badges & counts

- **Badges are transient, not ambient**: cart badge = live cart; order
  badge = active order only. Zero → the badge _disappears_, never "0".
- **Badge colour is always the same attention colour** (yellow/red) —
  never decorative.
- **ERP translation**: our manifest badges are pending-work counts —
  correct in spirit. Verify none are informational counts that never
  clear (e.g. "9+" persisting on a tab = stale-noise smell).

## Return-state & resumption

- **Cart survives everything** — close the app, come back tomorrow, the
  cart strip is still there (local + server merge).
- **Address/context persists** — reopening lands you where you were.
- **Interrupted checkout resumes** at the step you left, not from zero.
- **ERP translation**: half-filled DPRs/GRNs/indents are the equivalent —
  draft persistence + "you have an unfinished draft" affordance on
  return. Draft autosave exists on some forms — hunt where it's missing.

## What NOT to copy

- **Catalogue-browsing model** — workers don't browse an ERP; they act.
- **Promotional surfaces** — banners, ads, coupons have no analogue.
- **Consumer visual style** — its yellow-green brand, rounded-2xl
  softness, grocery photography. Our density and seriousness are right.
- **Location-gate onboarding** — their hard location prompt is fine for
  commerce, wrong for a worker tool.
