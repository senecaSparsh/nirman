# ADR-0005: Deny-by-default field serialization for PII

**Status**: Accepted
**Date**: 2026 (codified 2026-10-07)
**Deciders**: repo maintainers

## Context

`Employee` is one row carrying the most sensitive data in the system —
bank details, government IDs (PAN/Aadhaar/PF/ESI/UAN), wages, addresses,
and public-signing bearer tokens (`contractToken`/`offerToken`). The
question was how to keep adding columns over time without leaking them.

## Options considered

1. **Allow-by-default, redact the sensitive fields** — every new column is
   exposed unless someone remembers to redact it. One forgotten field =
   a leak. ❌
2. **Deny-by-default allowlist** — new columns are _invisible_ until
   explicitly added to a tier's allowlist. A forgotten field is hidden
   (safe), never leaked. ✅

## Decision

`apps/web/src/lib/employee-visibility.ts` —
`pickEmployeeRoster(row)` for `hr.view`-tier callers and
`redactEmployeeRow(row, scope)` where two tiers share a shape. The
permission flags come from `getEmployeeAccessScope()` in `lib/server.ts`;
the field tiers are the other half of the same policy. Enforced by
`employee-serialization.test.ts` — a raw `Employee` row never crosses the
wire.

## Consequences

- **+** Adding a sensitive column can never accidentally leak — the default
  is hidden.
- **+** One file is the whole policy; reviews are easy.
- **+** The H1 wall (below-top-tier dossiers invisible) composes on top.
- **−** A new legitimately-needed field is invisible until allowlisted —
  a deliberate trade; the test fails loudly so it's caught in dev.
- **Revisit if** a field tier model richer than view/edit is needed.
