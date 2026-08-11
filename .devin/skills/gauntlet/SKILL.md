---
name: gauntlet
description: The guardlet/gauntlet verification loop — takes a claim list from wayfinder, verifies each claim against the real codebase (read→verify→re-read→verify), and records discrepancies. Uses the critic rubric in .devin/gauntlet-rubric.md as the quality bar.
argument-hint: "[claims-from-wayfinder]"
allowed-tools:
  - read
  - grep
  - glob
  - exec
  - edit
  - write
---

# Gauntlet — The Verification Loop (Guardlet)

## Purpose

Gauntlet is the verification half of the **wayfinder + gauntlet** audit
loop. Wayfinder reads a spec section and extracts concrete claims.
Gauntlet then verifies each claim against the actual codebase using a
strict **read → verify → re-read → verify** loop, and records every
discrepancy in the audit notes file.

This is the "guardlet loop" the user refers to: a guarded, iterative
verification that never accepts a claim on first read — it always
re-reads the source to confirm.

## When to Use

- After wayfinder hands off a Claim List for a section.
- When the user asks to "read a section, verify it, then read again and
  verify, take notes of what is not as we wanted as per the doc."
- To audit `docs/PLATFORM.md` (or any spec) against the real codebase.

## The Gauntlet Loop (per claim)

For each claim from wayfinder:

### Pass 1 — Read & Verify

1. **Read the claim** and identify what codebase artifact would prove or
   disprove it (a Prisma model, a service function, an API route, a UI
   page, an enum value, a test file, a count).

2. **Locate the artifact** using grep/glob/read. Do not assume — search.

3. **Verify**: does the artifact exist and match the claim?
   - If YES → tentatively mark `CONFIRMED` (pending Pass 2).
   - If NO → mark `DISCREPANCY` and record what was found instead.
   - If UNVERIFIABLE (claim too vague) → mark `AMBIGUOUS`.

### Pass 2 — Re-read & Confirm

4. **Re-read the original spec text** (the exact lines from the doc) to
   make sure you didn't misread the claim. A surprising fraction of
   "discrepancies" are actually misreadings.

5. **Re-read the codebase artifact** to confirm your Pass 1 finding.
   Check edge cases:
   - Is the field name spelled exactly as claimed?
   - Is the type correct (e.g. `Decimal` not `Float`)?
   - Is the behavior actually implemented, or just stubbed?
   - Does a test actually exist, or just a describe block?

6. **Finalize verdict**:
   - `CONFIRMED` — both passes agree the claim is true.
   - `DISCREPANCY` — both passes agree the claim is false. Record:
     - Expected (what the doc says).
     - Actual (what the code has).
     - Severity (CRITICAL / MAJOR / MINOR).
   - `AMBIGUOUS` — the claim cannot be verified as stated.

## Severity Definitions

- **CRITICAL** — a claimed core feature/invariant is entirely missing
  or broken (e.g. "stock ledger uses recordMovement()" but no such
  function exists). The system cannot function correctly without it.
- **MAJOR** — a claimed feature is partially missing or wrong (e.g.
  doc says 101 models but there are 97; a claimed API route doesn't
  exist; a claimed UI page is a stub).
- **MINOR** — cosmetic or documentation drift (e.g. a field name
  differs by casing; a count is off by 1-2; a comment references an
  old name).

## Quality Bar

Gauntlet uses the critic rubric at `.devin/gauntlet-rubric.md` as the
reference bar for functional and UX claims. When a claim is about page
behavior, UI patterns, or functional completeness, compare the actual
implementation against the rubric — the implementation must **beat** the
bar, not just meet it. Equal-to-bar = FAIL (discrepancy).

## Output Per Claim

```
Claim N.M: "<claim text>"
  Pass 1: <artifact searched> → <found/not found> → <verdict>
  Pass 2: <re-read spec line> + <re-read artifact> → <confirmed/discrepancy>
  VERDICT: CONFIRMED | DISCREPANCY (severity) | AMBIGUOUS
  [if DISCREPANCY] Expected: ... | Actual: ...
```

## Section Verdict

After all claims in a section are verified, produce a section verdict:

```
=== §N. <Section Title> — GAUNTLET VERDICT ===
Claims verified: X
  CONFIRMED: Y
  DISCREPANCY: Z (CRITICAL: a, MAJOR: b, MINOR: c)
  AMBIGUOUS: w

DISCREPANCIES (ranked):
1. [CRITICAL] <what> — Expected: ... | Actual: ...
2. [MAJOR] <what> — Expected: ... | Actual: ...
3. [MINOR] <what> — Expected: ... | Actual: ...
```

## Recording Notes

Append every section's verdict + discrepancies to the audit notes file
(`docs/PLATFORM_AUDIT_NOTES.md` by default). Update the progress
bookmark at the top of that file after each section.

## Rules

- **Never accept a claim on first read.** The whole point of the
  guardlet loop is the second pass. Always re-read both the spec and
  the artifact before finalizing.
- **Search, don't assume.** Even if you "know" a function exists, grep
  for it. The codebase may have renamed or removed it.
- **Quote exact identifiers.** Discrepancies in spelling/casing are
  real findings.
- **Distinguish stub from implementation.** A function that exists but
  only `console.log`s is NOT a confirmed claim if the claim says it
  performs a real operation.
- **Distinguish test existence from test coverage.** A `describe` block
  with no `it` cases does not count as tested.
- **Be honest.** The goal is to find what's wrong, not to rubber-stamp.
  A clean section (all CONFIRMED) is fine, but most sections will have
  at least minor drift in a living codebase.
