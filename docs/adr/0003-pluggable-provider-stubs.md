# ADR-0003: All external integrations behind pluggable provider stubs

**Status**: Accepted
**Date**: 2026 (codified 2026-10-07)
**Deciders**: repo maintainers

## Context

The business wants Tally sync, WhatsApp alerts, portal listings (99acres/
MagicBricks/Housing), HSN/GST lookup, OCR for DPRs, and Twilio call
tracking. Each is a third-party service that can be down, rate-limited, or
simply not yet contracted.

## Options considered

1. **Direct SDK/API calls inside business logic** — simplest to write, but
   a provider outage throws into the core mutation path and testing hits
   real APIs. ❌
2. **Provider interface + stub + real implementation** — every integration
   implements a small interface; the default is a stub that logs; the real
   provider activates by env/config. ✅

## Decision

Each integration ships a `*Provider` interface with a working stub —
`TallyProvider`, `WhatsAppProvider`, `EmailProvider`, `PortalProvider`,
HSN/GST providers, OCR providers. The app runs fully with all stubs;
enabling a real provider is configuration, not code.

## Consequences

- **+** A dead third party degrades one feature, never the ledger. This is
  what makes `docs/DEPENDENCIES.md` a short "blast radius" table.
- **+** Tests and dev need no credentials; every integration is unit-testable
  against its stub.
- **+** New providers = implement the interface, flip config.
- **−** The stub means "wired" ≠ "delivering" — a provider can look
  integrated while messages only log. Mitigation: `NotificationLog`/
  `TallySyncLog`/`PortalListing` statuses surface real vs stubbed.
- **Revisit never for structure**; revisit per-provider when the business
  contracts the real service.
