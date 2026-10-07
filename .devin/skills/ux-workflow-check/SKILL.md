---
name: ux-workflow-check
description: |
  Use when you need to find what a real user would need but nobody wrote down —
  surfacing tacit assumptions, missing screens/features, and broken workflow links
  grounded in the user's actual intent, not imagined "best practices." Triggers:
  "UX check", "find what's missing", "workflow gaps", "is this annoying to use",
  "review this product for users", or when you're about to declare a one-pass
  review done. Works for UI, CLIs, reports, and docs — anything a user consumes,
  at plan stage (a spec) or audit stage (a built product). Not for visual polish
  (use a design-review tool) or idea/demand validation (use an idea-validation tool).
---

# UX Workflow Check

## Identity

**Expose the gap between how the builder sees the problem (shaped like their artifact) and how the user lives it (shaped like their intent) — by forcing a first-person simulation.** UI, features, and screens are _derived_ from intent, not the starting point. This is not a checklist pass; it is living through the product as the user.

This is a discipline-enforcing skill. If outputs are empty, if you slip into builder-framing, or if you try to finish after one persona on one pass, **saying "done" is itself a violation.**

## ⛔ Stop Gate (read first)

**Do not say "done" / "review complete" until all three hold. If any is missing, keep looping.**

1. **Output gate** — every round produces G1–G4 (below)
2. **Lens gate** — every round passes the 4 self-checks
3. **Convergence gate** — either (a user said "N rounds" → N rounds exhausted) OR (default: persona axes exhausted + two _different_ consecutive rounds yield zero new gaps + convergence evidence printed)

Default is **dry-until** convergence. But **no lazy convergence** — declaring dry while a persona axis is unexplored is a violation (same spirit as "don't shrink scope to pass"). If the user names a count, that count is absolute (keep going even after it converges).

## Engine (convergence loop)

```
seen = accumulated gaps;  dry = 0
while (named N not exhausted) OR (no count and dry < 2):
    pick a persona / situation     # if none given, self-generate from the axes below; a NEW lens each round
    first-person walk → G1–G4 → 4 self-checks
    new = thisRound − seen
    if new is empty: dry++         # but NOT if an axis is still unexplored
    else: dry = 0; seen += new
converged/exhausted → report all gaps → print convergence evidence → flag only low-confidence items for follow-up
```

## One round = 4 output gates (no blanks)

| Gate                     | Must produce                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1 SEED spec**         | who / intent. If complex or multi-stakeholder, a job statement: "When [situation], I want to [motivation], so I can [outcome]"                                                                                                                                                                                            |
| **G2 First-person walk** | entry → … → **return visit**, in the _person's action order_ — never the artifact's component order. Each step: `expectation / reality / [observed]·[inferred] basis`                                                                                                                                                     |
| **G3 Three findings**    | ① **intent gap**, one line: "builder sees it shaped like X ↔ user lives it shaped like Y" ② **tacit assumptions**, N of them: things the builder took for granted + "what breaks when each is violated" ③ **missing screens/features**: for _each_ G2 step, at least one "should be here but isn't" or an explicit "none" |
| **G4 Gap table**         | each gap: `type / layer (data·backend·wiring·frontend) / severity (S1 blocks · S2 friction · S3 polish) / [observed]·[inferred] basis`                                                                                                                                                                                    |

`[observed]` = walked/run/checked in code or live. `[inferred]` = reasoned from intent. **Never tag as [observed] what you didn't walk.** In audit mode, actually drive the product where you can to fill [observed].

## The 4 self-checks (lens gate) — if any trips, the round is void; redo

- You framed the problem in **system vocabulary** (source / payload / button / API / table) → reframe in the user's intent vocabulary
- A finding **didn't walk out of this product's specific intent** — it's a generic checklist item that fits any product → re-anchor it to a G2 step
- You **didn't walk** the empty state, the failure, or the return-after-interruption → walk them
- You're about to declare done/dry on a **"good enough" feeling** → first confirm no persona axis is left unexplored

## Persona / situation axes (self-generate when none given)

| Axis           | Variants                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Expertise      | first-timer / power regular                                                                           |
| State          | rushed / skeptical / returning-after-failure                                                          |
| Context        | mobile, deadline-imminent / desktop, routine                                                          |
| Intent variant | same person, different SEED ("don't miss anything" vs "do this one thing now" vs "what even is this") |

**Exhaust these axes before declaring dry.** Filling "zero new gaps" by repeating the same lens does not count.

## Convergence evidence (required when declaring done)

```
Personas / situations tried: [full list]
Last 2 rounds: different lenses [P_i, P_j] / each zero new gaps
Unexplored axes: none
```

Declaring "done" without this block = violation.

## Intensity dial

If obvious/simple (the SEED is inferable in one line), don't reach for job statements or multi-stakeholder branching; converge fast. If complex/multi-stakeholder, bring out the job statement, stakeholder branches, and confirmation. The methods (JTBD, cognitive walkthrough) are tools on the shelf, not a questionnaire to run at every step.

## Output

A markdown report, accumulated across rounds: `per-persona walk / G3 three findings / G4 gap table / convergence evidence`. Gaps fall into layers, so the report feeds directly into an implementation plan — what to build at which layer is already decomposed.

See `reference/example-dealradar.md` for a full worked walkthrough.

## Red Flags — STOP, keep looping

- You're wrapping up with "the top 3 things" / "most important fixes"
- You're organizing findings by artifact component or Critical/Nice buckets
- You did one persona, one lap, and feel finished
- You're emitting guesses untagged ("I only saw the spec, give me code to confirm")
- You didn't write the one-line intent gap

**All of these mean: not done. Another persona. Again.**

## Rationalization table (observed in baseline testing)

| Excuse                                       | Reality                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| "One lap, so I found all the gaps"           | One persona is one lens. A different persona surfaces different gaps. Loop to dry.           |
| "Going component-by-component is systematic" | Component order = builder's view. Users don't live in component order. Walk in action order. |
| "I applied general UX best practices"        | A list that fits any product isn't _this_ product's intent gap. Anchor to a G2 step.         |
| "It's a guess because I didn't see code"     | Then tag it [inferred] and give the intent basis. No untagged assertions.                    |
| "Feels converged"                            | If a persona axis is unexplored, it isn't converged. No evidence block = violation.          |

## Provenance

Built with test-driven skill authoring: baseline runs _without_ the skill were observed to fail in five ways (artifact-framing, one-pass-done, single-persona, memorized-checklist, untagged-guesses); the gates above were written to block exactly those. Verified cross-agent: the same product run under "be quick" pressure on four different agents all looped to convergence with full gate compliance. Roots: Jobs-to-be-Done (intent-first) + Cognitive Walkthrough (first-person) extended with full-stack layer decomposition.
