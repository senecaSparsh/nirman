# Wayfinder Tracker — Local Markdown

This directory is the **local-markdown issue tracker** for the Nirman Inventory refinement map.

## Files

- `MAP.md` — the canonical map (destination, decisions so far, fog, out of scope). Read first.
- `tickets/` — one file per decision ticket. Filename = ticket id + slug.

## Frontier query

The **frontier** = open, unblocked, unclaimed tickets. To find it:

```
grep -L "Status: **closed**" .wayfinder/tickets/*.md
```

Then filter for tickets whose `Blocked by:` line lists only closed tickets.

## Ticket lifecycle

1. **Claim**: add your name to the `Claimed by:` line (add one if missing) before starting work.
2. **Work**: one ticket per session (exception: research tickets). Follow the checklist.
3. **Resolve**: fill the `## Resolution` section with the decision/facts, set `Status: **closed**`.
4. **Update map**: add a one-line gist + link under `## Decisions so far` in `MAP.md`.
5. **Graduate fog**: if resolving cleared fog, move sharp-enough items from `Not yet specified` into
   new tickets.

## Blocking

Blocking is recorded in each ticket's `Blocked by:` line. A ticket is unblocked when every ticket
it lists is closed.

## Current frontier

- **T01** (task) — ✅ closed. App runs with seeded data.
- **T02** (grilling) — ✅ closed. Procurement verified end-to-end; 5 defects/UX gaps fixed.
- **T03** (grilling) — ✅ closed. Stock/materials/transfers verified; 3 critical gaps fixed
  (material form fields, stock count API+UI, inter-company STO fields).
- **T04** (grilling) — ✅ closed. Projects/units/costs verified; fixed GL integrity bug
  (project cost delete wasn't reversing GL entry).
- **T05** (grilling) — ✅ closed. Land purchase/partition/valuation verified; no defects found.
- **T06** (grilling) — ✅ closed. Sales/customers verified; fixed GL integrity bug
  (sale cancel wasn't reversing GL entry).
- **T07** (grilling) — ✅ closed. Finance/GL verified; fixed 2 bugs: expense delete
  wasn't reversing GL, and RETURN movement classified as IN (broke all supplier returns).
- **T08** (grilling) — ✅ closed. Equipment verified; excellent kanban UX; no defects.
- **T09–T12** (grilling) — all **unblocked**. Pick any one per session.
- **T13–T17** (build) — **NEW modules** from brother's ERP design (HR/DPR, Rent/Lease,
  Hierarchical RBAC, Dynamic Pricing, Mobile Parity). These are builds, not verification.
  Priority: T13 (HR/DPR) is the biggest missing piece → T15 (RBAC hierarchy) → T14 (Rent) →
  T16 (Dynamic Pricing) → T17 (Mobile Parity).
