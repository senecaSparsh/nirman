# Documentation Index — Nirman Inventory OS

> One index, grouped by the question you're trying to answer. If a doc
> answers a question nobody asked, it doesn't belong here.

## 🚀 Getting started

| I want to…                | Read                               |
| ------------------------- | ---------------------------------- |
| Get the app running today | `docs/ONBOARDING.md` → `AGENTS.md` |
| Contribute a change       | `CONTRIBUTING.md` (+ PR template)  |
| Decide what to work on    | `DECISIONS.md` (ranked backlog)    |

## 🏛️ Understand the system

| I want to…                      | Read                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| Understand the domain model     | `docs/ARCHITECTURE.md`                                        |
| Know _why_ a choice was made    | `docs/adr/` (decision records)                                |
| Know what's verified vs assumed | `TESTING_FINDINGS.md`, `docs/AUDIT_LEDGER.md`                 |
| See the design system rules     | `AGENTS.md` §Design System                                    |
| Know the team's real workflows  | `docs/SRG_REALCON_TEAM_WORKFLOWS.md`, `docs/source-material/` |

## 🛡️ Operate it in production

| I want to…                      | Read                                                            |
| ------------------------------- | --------------------------------------------------------------- |
| Fix something that's broken     | `docs/RUNBOOK.md`                                               |
| Deploy                          | `DEPLOY.md`, `docs/COOLIFY_DEPLOY.md`, `scripts/deploy-prod.sh` |
| Restore from backup / DR        | `docs/DISASTER-RECOVERY.md`                                     |
| Promise a reliability number    | `docs/SLO.md`                                                   |
| Check what an outage affects    | `docs/DEPENDENCIES.md`                                          |
| Answer "is it production-ready" | `docs/PRODUCTION-READINESS.md`                                  |
| Handle a security report        | `SECURITY.md`                                                   |

## 📈 Scale & hard questions

| I want to…                           | Read                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| Know what breaks at 10x              | `docs/CAPACITY.md`                                     |
| Answer senior-level design questions | `docs/SYSTEM-DESIGN-DEEP-DIVE.md`                      |
| Check the performance budgets        | `docs/PERFORMANCE.md`                                  |
| See the app as a user walks it       | `docs/UX-MAP.md` (manual click-through map + findings) |

## 📋 Audits & research

| Area                             | Doc                                                      |
| -------------------------------- | -------------------------------------------------------- |
| Module-by-module coverage        | `docs/use-cases-audit/`                                  |
| Competitor gaps                  | `docs/competitor-map/`                                   |
| UX research                      | `docs/MOBILE_UX_RESEARCH.md`, `docs/MOBILE_FLOW_MAP*.md` |
| Navigation design                | `docs/NAVIGATION.md`                                     |
| PII visibility policy            | `docs/EMPLOYEE-FIELD-VISIBILITY.md`                      |
| Owner transcripts (source truth) | root `*.txt`, `docs/source-material/`                    |

## House rules for docs

- **One question, one doc.** Don't duplicate an answer in two files —
  link instead.
- **A doc that names a file must keep it true.** If the code changes, the
  doc changes in the same PR.
- **Update `DECISIONS.md` and this index** when you add a doc.
