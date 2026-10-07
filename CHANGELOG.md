# Changelog

All notable changes to Nirman Inventory OS. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
date-based (`YYYY.MM.DD`) until the first numbered release.

For the _what was verified_ history, see `TESTING_FINDINGS.md` and
`docs/AUDIT_LEDGER.md`. For _why_, see `docs/adr/`.

## [Unreleased]

### Added — governance layer (2026-10-07)

The big-company management artifacts, so the system's operation is
documented, not tribal:

- `docs/PRODUCTION-READINESS.md` — full production-readiness review: every
  launch-checklist question answered with file evidence + named-risk ledger
- `SECURITY.md` — vulnerability reporting + controls inventory
- `CONTRIBUTING.md` — workflow, PR checklist, commit style
- `docs/RUNBOOK.md` — incident response: severities, known failures → fixes,
  secrets rotation, postmortem template
- `docs/SLO.md` — service-level objectives + error-budget policy
- `docs/DISASTER-RECOVERY.md` — RPO/RTO, 3-layer backups, restore drill
- `docs/DEPENDENCIES.md` — third-party map with per-dependency failure mode
- `docs/CAPACITY.md` — capacity model + ordered 10x scaling path
- `docs/adr/` — 7 architecture decision records for the irreversible choices
- `docs/SYSTEM-DESIGN-DEEP-DIVE.md` — the hard interview questions
  (concurrency, idempotency, consistency, races) answered with code evidence
- `docs/README.md` — doc index grouped by the question being asked
- `.github/PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS`, `ISSUE_TEMPLATE/`
- `.nvmrc` + `engines` — pin Node 22 (was 22-Docker vs 23-dev drift)

## Historical context

This repo's substantive history lives in `git log` and `docs/AUDIT_LEDGER.md`
(the multi-pass audit) rather than a retrofitted changelog. Highlights by
theme:

- **Inventory core**: immutable `StockMovement` ledger + MAC + serializable
  txns; polymorphic stock (raw materials ↔ real-estate units)
- **Procurement**: indent → ≥3-quote gate → comparative analysis → PO →
  GRN; rate contracts, vendor ratings, value-based approval routing
- **Land & sales**: cost breakup, subdivision/un-divide, ATS→BBA→registry
  lifecycle, CLP milestone payments, broker commission
- **HR**: GPS attendance, 5-code status, traffic-light DPR linkage, payroll,
  H1–H6 hierarchy, leave management
- **Finance**: double-entry GL (Dr=Cr in the same txn), Tally sync, GST/HSN,
  project P&L, EVM/CPM scheduling, RA bills with TDS
- **Platform**: 14-role RBAC + scope + delegation, auto-audit, ErrorLog
  triage, 21 self-healing layers, offline queue, PWA, mobile surface
