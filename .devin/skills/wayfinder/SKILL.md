---
name: wayfinder
description: Navigates a long specification document section by section, orienting the auditor to what each section claims before verification. Use with the gauntlet skill for full read→verify→re-read→verify loops.
argument-hint: "[document-path] [section-range]"
allowed-tools:
  - read
  - grep
  - glob
  - exec
---

# Wayfinder — Section-by-Section Spec Navigation

## Purpose

Wayfinder orients you through a large specification document (like
`docs/PLATFORM.md`) one section at a time. It does NOT verify claims —
that is the job of the **gauntlet** skill. Wayfinder ensures you read
every section in order, understand what it claims, and hand off a
precise "claim list" to gauntlet for verification.

## When to Use

- Auditing a long spec document (100+ lines) against a real codebase.
- When the user asks to "go section by section" or "read a section,
  verify it, then read again and verify."
- As the navigation half of a wayfinder + gauntlet audit loop.

## The Wayfinder Loop (per section)

1. **Locate** — Find the next unread section by scanning the document's
   table of contents or the next `## N.` heading. Track your position
   (a bookmark) so you never skip or re-audit a section.

2. **Read** — Read the full section text. Do not skim. Capture:
   - The section number and title.
   - Every concrete claim about the system (schema models, field names,
     service functions, API routes, UI pages, enums, counts, behaviors,
     state machines, invariants).
   - Any stated counts ("101 models", "169 tests", "180 handlers").
   - Any stated file paths or function names.

3. **Extract claims** — Produce a numbered **Claim List** for the section.
   Each claim must be falsifiable — something the codebase either has or
   does not have. Example:
   - Claim 1.1: "The schema has a `Company` model with `deletedAt`."
   - Claim 1.2: "There are 101 Prisma models."
   - Claim 1.3: "`recordMovement()` appends a `StockMovement` and
     atomically updates `StockLocationItem`."

4. **Hand off** — Pass the Claim List to the gauntlet skill for
   verification. Wait for gauntlet's verdict + discrepancy notes before
   advancing to the next section.

5. **Advance** — Record the section as "audited" in the bookmark, then
   move to the next section. Repeat until the document is exhausted.

## Bookmark Format

Keep a running bookmark so progress survives interruptions. Store it at
the top of the audit notes file (e.g. `docs/PLATFORM_AUDIT_NOTES.md`):

```
## Audit Progress Bookmark
- Last completed section: §3
- Next section: §4
- Total sections: 44
- Sections audited: 3/44
```

## Output Per Section

For each section, wayfinder outputs:

```
=== §N. <Section Title> ===
SOURCE: docs/PLATFORM.md lines X–Y

CLAIMS:
N.1 <claim>
N.2 <claim>
...

→ Handing off to gauntlet for verification.
```

## Rules

- **Never skip sections.** Even "obvious" or "boilerplate" sections
  may hide concrete claims.
- **Never verify claims yourself.** Wayfinder only reads and extracts.
  Gauntlet verifies. Separation of concerns keeps the audit honest.
- **Quote exact identifiers.** When a claim names a model, field,
  function, route, or file, copy it verbatim — typos in the spec are
  themselves findings.
- **Note ambiguity.** If a claim is vague ("the system handles X"),
  flag it as `AMBIGUOUS` so gauntlet can decide whether it's verifiable.
- **Respect document order.** Always go top-to-bottom unless the user
  explicitly asks to jump to a section.
