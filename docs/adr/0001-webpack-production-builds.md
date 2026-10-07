# ADR-0001: Webpack for production builds, Turbopack for dev

**Status**: Accepted
**Date**: 2026-09 (codified here 2026-10-07)
**Deciders**: repo maintainers

## Context

Next.js offers two bundlers. Turbopack is dramatically faster in dev (HMR)
and was the obvious dev choice. Production builds under Turbopack
(`next build --turbo`) hit a known upstream bug — "module factory is not
available" — triggered by the `export *` re-export pattern in Prisma's
generated client (vercel/next.js#86132, #88534, #86714). The failure is
nondeterministic and produces an unbootable bundle.

## Options considered

1. **Turbopack everywhere** — fastest, but production builds break
   nondeterministically on our own generated client. ❌
2. **Webpack everywhere** — stable, but slow dev HMR. ❌
3. **Turbopack dev + Webpack prod** — fast inner loop, stable artifact.
   The dev wrapper adds auto-recovery for Turbopack's cache-desync class
   of dev-only errors. ✅

## Decision

`apps/web/package.json`: `build` runs `node scripts/build.mjs` (webpack).
`dev` runs Turbopack through `dev-with-recovery.mjs`. `build:turbo` is kept
only for testing Turbopack-specific bugs.

## Consequences

- Production builds are stable and deterministic.
- Dev keeps fast HMR + self-healing cache recovery.
- Two bundlers = two possible behavioral deltas; mitigated by the ESLint
  rule `nirman/no-process-env-node-env-in-client` (the specific pattern
  that triggered Turbopack chunk desync) and the dev-fallback guard.
- **Revisit when** upstream lands a fix for the module-factory bug — then
  `build:turbo` can become the default.
