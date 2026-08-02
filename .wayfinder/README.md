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

- **T01** (task) — unblocked, unclaimed. Start here: it unblocks T02–T12.
- T02–T12 (grilling) — all blocked by T01.
