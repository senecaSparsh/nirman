# UX Backlog

Aspirational UX specs that are NOT discrepancies — deferred until the core
system is stable. These are nice-to-haves, not blockers.

## Items

1. **Skip-to-content link (a11y)** — low impact for this user base. The
   team uses desktop Chrome with mouse navigation. Add when mobile
   usage justifies it.

2. **Keyboard shortcut help (`?` overlay)** — developer-oriented. The
   command palette (⌘K) already covers the main navigation need. A
   separate `?` overlay for all shortcuts is nice but not essential.

3. **Zebra striping toggle** — cosmetic. The current table design uses
   spacing and borders for row separation. Zebra striping is a
   preference, not a correctness issue.

4. **Contextual help / tooltips** — onboarding feature. The system is
   used by a small team that knows the domain. Tooltips would help new
   users but the team is stable.

5. **Print modal** — current `/print/*` routes work. A modal-based
   print preview would be nicer but the dedicated print pages are
   functional and produce clean output.

6. **`html5-qrcode` fallback** — BarcodeDetector works in Chrome
   (the only browser used). Add a polyfill when mobile usage grows.

7. **G+T/G+S/G+P/G+F two-key navigation** — developer candy. The
   command palette and world rail already provide fast navigation.

8. **Drag-to-reorder columns** — low impact. Column visibility is
   already configurable. Ordering is a nice-to-have.

9. **Real-time updates (SSE)** — replaced by 30-second polling
   (Phase 2D). SSE is overkill for this user base size.

10. **Web Share API / ESC-POS printing** — niche. The team uses
    desktop printers and PDF export. Mobile share and thermal printer
    support are deferred until field usage grows.

11. **Virtualization** — deferred until data volumes validated (>5K
    rows). Current data volumes are well under the threshold where
    virtualization would matter.

## When to Revisit

These items should be revisited when:
- Mobile usage exceeds 20% of sessions
- Team size grows beyond 50 users
- Data volumes exceed 5K rows per table
- New team members need onboarding support

Until then, the core system takes priority.
