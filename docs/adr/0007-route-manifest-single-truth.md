# ADR-0007: `route-manifest.ts` as the single mobile-nav truth

**Status**: Accepted
**Date**: 2026 (codified 2026-10-07)
**Deciders**: repo maintainers

## Context

Mobile navigation (`/m/*`) was being declared in six hand-maintained maps
that drifted: 46 of 121 real static routes were missing from nav, and 17
were reachable only by typing the URL. Header title, Up target, breadcrumbs,
menu tree, active tab, search index, and badge endpoints were each a
separate declaration.

## Options considered

1. **Keep the per-feature nav configs** — simplest, but they're guaranteed
   to drift (they already had). ❌
2. **One manifest, everything derived** — `route-manifest.ts` declares each
   route once (`RouteEntry`: path, parent, perm, persona hint); titles, up
   links, breadcrumbs, menus, active tab, search, badges all derive. ✅

## Decision

`apps/web/src/lib/route-manifest.ts` is the SINGLE SOURCE OF TRUTH for
mobile navigation. Creating `app/m/<path>/page.tsx` REQUIRES a matching
`RouteEntry`; `route-manifest.test.ts` (36 guards in CI) fails the build on
drift — it enforces `parent` is a real ancestor/hub, Home is the only root,
exactly one tab resolves active per route, and `sharesListWith` pairs are
declared. Access is gated by `perm` against effective permissions
(never role/persona — those are ranking hints only).

## Consequences

- **+** Nav can't drift — the test fails the build.
- **+** Granting one user a permission makes the page appear in their menu
  with zero nav config (`canAccess` on effective perms).
- **+** One place to review "who can open what".
- **−** Adding a route is two edits, not one — the test makes the second
  mandatory rather than forgettable.
- **Revisit if** desktop nav should fold in too (currently `nav.ts` is the
  desktop truth — a deliberate separate surface).
