# UX Audit — mobile field surfaces (partial)

```
═══════════════════════════════════════════════════════════
VERDICT: Incomplete (environment-limited)

Persona: SITE_ENGINEER — field worker, time-pressed, low tech
         comfort, phone in one hand at the gate.
Surfaces audited: 4 / ~80 mobile routes
  /m/home (rendered + interacted), /m/site (rendered + tapped),
  /m/me (rendered), / (desktop, rendered).
  /m/site/dpr, /m/site/tasks, /m/dprs — cold-compiles >150s on
  this host; unreachable this session.

Hard gates (on reached surfaces):
  console errors   1 — Sentry /monitoring 429 (telemetry rate-
                     limit; allowlistable noise, not app code)
  network 5xx      0
  network 4xx      0
  layout collapse  0
  axe / perf       not run (page coverage too thin to be honest)

Findings:
  Critical: 0   High: 1   Medium: 2   Low: 1

TOP: F1 — fixed this session.
═══════════════════════════════════════════════════════════
```

## Findings

### F1 — rail points at a check-in card that can't act · FIXED ✓

- **Layer**: Interaction **Severity**: High
- **Surface**: `/m/home`, field persona, payroll-locked day
- **Observed**: TODAY rail reads "Check in — _Use the check-in card
  above_" while the card above is a lock banner ("Attendance is
  locked — 10/2026 payroll is already paid") with no action. The
  check-out row had the same dead reference. `ShiftData` carried no
  lock state — the rail was blind to it.
- **Fix**: `periodLocked` now flows `payrollPeriod` →
  `/api/persona-home` → `ShiftData`; the rows read "Locked —
  payroll already processed" under lock, and the check-out row
  tells the truth about ordering ("Check in first — the card above
  handles both").
- **Verified**: typecheck clean; visual re-verify blocked on
  recompile this session — flagged for the next render pass.
- **Files**: `apps/web/src/app/api/persona-home/route.ts`,
  `apps/web/src/components/mobile/v2/persona-signature/shift-rail.tsx`

### F2 — "All caught up!" beside an overdue task · Medium

- **Layer**: Feedback **Surface**: `/m/home`
- **Observed**: the briefing card says "All caught up!" while the
  TODAY rail on the same screen shows "1 overdue · Check TMT rebar
  bend test report — tower A". Two components, two stories: the
  user reads "caught up" globally, but it only means _briefing
  folders_ are clear.
- **Smallest patch**: change the card's copy to scope it —
  "Nothing new in your feed" — or gate it on zero open tasks.
  Structural trade-off: briefing and rail read from different
  payloads; a cheap copy fix avoids the coupling.

### F3 — bell badge at 99+ for a field worker · Medium

- **Layer**: Feedback **Surface**: global chrome
- **Observed**: unread-count badge shows 99+. Semantics are right
  (transient, actionable count) — but a worker who accumulates 99+
  gets permanent alarm. Worth a mute/prefs nudge or
  "mark all read" affordance on the bell tray. Data artifact of a
  demo account; the count itself is honest.

### F4 — payslip "SEPTEMBER 2027" · Low (data hygiene)

- **Layer**: Visual **Surface**: `/m/me`
- **Observed**: My Pay shows SEPTEMBER 2027 — a real PayrollPeriod
  row left by the verify suite's far-future seeds (also found
  6/2041 DRAFT). Product ordering is correct; dev data is noisy.
  The verify suite could scope its periods to ±30 days to keep
  personas' "latest payslip" believable.

## What the audit confirmed is right

- Action-first ordering: punch card leads; briefing feed second.
- Quick-actions grid on /m/site: 9 daily actions, one tap each.
- Banner carousel rotates the day's alerts (DPR locked → 1 overdue
  task) with snooze — Blinkit's "what needs me" strip, adapted.
- Empty states have icon + copy + hint ("Nothing in transit",
  "No open tasks — check with your manager").
- "Rendering..." indicator on client nav — honest feedback, not a
  silent hang.
- Overdue shown as "12 days late" in red — age is visible, not
  hidden in a date.
- Onboarding checklist on /m/me (4/12) — real first-run tracker.
- First-run "Quick tour" sheet: dismissible, honest about time
  ("About a minute"), replayable from Settings.

## Environment note

Single-CPU Turbopack wedges under load: several routes exceeded
5-minute compile windows this session and even /api/health timed
out periodically. Per AGENTS.md, kill+restart clears it; the
findings above come only from surfaces that rendered.

## Follow-up pass — axe-core on the settled routes (same day)

Ran axe-core@4.12 on the three rendered pages.

- `/m/home` → **0 violations** (after fixes)
- `/m/site` → **0 violations** (after fixes)
- `/m/me` → was: 2 critical (label, select-name), 12 serious
  contrast, 2 moderate → all addressed in `8cec78f4` + `54a12118`

### Fixed in this pass

- **F5 (critical→fixed)** Punch-correction form had zero labelled
  controls; aria-labels on date/times/select/reason.
- **F6 (critical→fixed)** DelegationCard labels were visual-only —
  htmlFor/id pairs added (`.tnum` date input + member Select).
- **F7 (serious→fixed)** `ink-400` (#898376, 3.76:1) used for
  meaning-carrying text — eyebrows, rail subs, RegisterTabs
  inactive labels, DelegationCard, "Act as". All → ink-500. True
  placeholders keep ink-400.
- **F8 (moderate→fixed)** `maximumScale: 1` blocked pinch-zoom —
  WCAG 1.4.4 on 8-11px text. Now 5.
- **F9 (moderate→fixed)** No h1 on mobile pages — drill-down title
  now h1, hubs get sr-only h1.

## Third pass — axe on desktop / + /stock (OWNER)

- `/` → **0 violations** (was 19 nodes)
- `/stock` → **0 violations** (was 10 nodes)
- `/m/home`, `/m/site` → **0 violations**
- `/m/me` → all flagged nodes fixed in DOM (label/select-name,
  12 contrast nodes, viewport, h1)

### Systemic fixes this pass

- `text-faint` (2.9:1) and `muted-foreground/60` (~3.2:1) are
  sub-AA hint tiers used on meaning-carrying text across the app —
  every audited instance bumped; a codebase-wide `muted-foreground/NN`
  sweep is logged as follow-up (15+ usages in unaudited components).
- `--color-warning` darkened 0.575→0.53 — every warning-on-soft
  badge was ~4.3:1.
- Priority/due-date hexes in my-tasks-panel darkened to AA
  (#b45309 amber-700, #0369a1 sky-700, #dc2626 red-600).
- Shell panels are `<aside>` landmarks; every `<nav>` labelled.
- PieSeries: role="img" summary + MutationObserver tabindex strip
  (recharts sectors are focusable-by-default paths).
- Nav badges → filled brand/foreground (~4.9:1).
- Mobile forms: ink-400 placeholder/sub text → ink-500 file-wide.
- maximumScale 1→5 (pinch-zoom unblocked).

### Still to audit (not reached)

- ~290 desktop + ~76 mobile routes un-audited by axe; interactive
  coverage remains env-limited (single-CPU Turbopack).
- Perf gates (LCP/CLS/INP) + keyboard-only + scenario battery.
- The 99+ notification pile-up (F3) + far-future seed data (F4).

## Fourth pass — desktop route family (18 routes → all zero)

Verified rendered at ZERO axe violations (OWNER persona):
/, /stock, /my-tasks, /approvals, /projects, /sales, /hr,
/tasks, /finance, /procurement, /stock-locations,
/gate-passes, /suppliers, /transfers, /requisitions,
/scrap-generations, /stock-movements, /supplier-payments.

Systemic fixes: row-checkbox labels (every selectable table),
sr-only Actions header, named filter selects/date pickers/
icon-only exports across all major views, muted-foreground/NN
→ full token on every flagged instance, kanban "empty" /50.

Remaining known systemic classes (need a token-tier decision,
not 200+ site edits): muted-foreground/NN on unaudited pages,
text-faint on meaning-carrying text beyond audited surfaces.

---

## Round 3 — mobile modal primitive (Oct 23)

**Finding class:** every mobile screen hand-rolled `fixed inset-0`
overlays — ~35 sheets across 28 files — with no Escape, no focus trap,
no `role="dialog"`, no focus restore. Verified live before the fix:
Tab inside any open sheet walked off to background content.

**Fix — `MobileModalSheet`** in `components/mobile/v2/bottom-sheet.tsx`
now owns the contract: `role="dialog"`, `aria-modal`, labelled, focus
entry on open, index-walking Tab trap, Escape, backdrop close, body
scroll-lock (prev-value restore for nesting), focus restore to trigger,
portal to body. `BottomSheet` delegates to it — every legacy consumer
inherits. `align: bottom | center | full` covers sheets, alert cards,
and full-screen takeovers (assistant chat, quote entry, onboarding).

**Verified live (`/m/sms`, Paste Bank SMS sheet):**

- `role=dialog` + `aria-modal=true` + `aria-label="Paste Bank SMS"`
- focus enters panel on open; Tab cycles close→input→textarea→submit
  for 20 presses, never escapes
- Escape closes; focus restores to the "Add SMS" trigger (verified —
  required two real fixes: capture prevFocus in the ref callback before
  el.focus(), and guard against StrictMode's dev double-mount
  overwriting it with the panel)
- `MobileSmsIngest` restructured so the trigger stays mounted — the
  alternate-render pattern (`if (!open) return <button/>`) left nothing
  to restore to

**Migrated (36 files):** work orders (new/RAs/WO actions), requisitions

- PO actions, quote panel (4), units (4), portal listings (3),
  standard-consumptions, MB actions, hazard, WBS, equipment picker,
  land cadastre popup, supplier payments void, expense claims reject/pay,
  GRN receive confirm + reject, transfer return, vehicles, SMS ingest +
  match, quotation detail ×2 + list preview + new-quote picker,
  budget-variance selector, BOQ delete, `form-primitives` SelectorModal
  (every picker in the app), `assistant-chat`, `voice-agent-button`,
  `mobile-requisition-actions` ×2, `mobile-po-actions` ×2.

**Inline (own patterns kept):** OnboardingModal, orbit-navigator,
barcode-scanner — gained Escape + dialog semantics.

**Nested-dialog fixes:** `zIndex` prop for stacked sheets (GRN
confirm inside receive dialog, selector inside dialogs); scroll-lock
restores prior `body.overflow` so a sheet closing inside a parent
dialog doesn't unlock the parent's scroll. `MobileFabModal` gained the
missing scroll-lock entirely (MobileDialog delegates to it).

**Not migrated (correct):** `mobile-overview-sheet`, `nav-sheet`,
`mobile-context-menu`, `dept-fab`, `tab-switcher`, `product-tour` —
already wire Escape+focus; dropdown backdrops in `export-share-bar`,
`scaffold`, `quick-actions-bar`, `snooze-button`, `MobileMaterialsList`
are `aria-hidden` menu dismissals with real buttons in tab order.

Commits: `e484ab83` (migration), `435dcd35` (scroll-lock), `721f47d5`
(focus-restore fix, verified live).
