<!--
PR checklist — the reviewer will check these. Delete the N/A lines.
See CONTRIBUTING.md for the full conventions.
-->

## What & why

<!-- One paragraph: what changed and why. Link the DECISIONS.md item or
TESTING_FINDINGS.md bug number if applicable. -->

## Blast radius

<!-- What could this break? Check the modules touched. -->

- [ ] Touches money math / GL posting / stock ledger / payroll
- [ ] Touches permissions / scope / delegation / serialization (PII)
- [ ] Touches auth or public endpoints
- [ ] None of the above

## Checklist

- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` pass locally
- [ ] Schema change → migration committed (`migrate:dev`), `migrate:check` passes
- [ ] New `/m/*` route → `route-manifest.ts` `RouteEntry` added, `perm` set
- [ ] New permission → `PERM.*` + role matrix + nav `roles`
- [ ] New `/api/cron/*` route → `scheduler.sh` line added
- [ ] New env var → `.env.example` + `env-validation.ts`
- [ ] Employee/PII data → serialized via `employee-visibility.ts`
- [ ] Lists bounded; aggregations in DB (no `findMany().reduce()`)
- [ ] Audit: mutations covered by auto-audit or `opts.audit`
- [ ] Status colors from `STATUS_MEANING`/`StatusPill`; button groups horizontal
- [ ] Tests added for pure helpers / business rules touched

## Verification

<!-- How was this verified? Screenshots, test output, or a Playwright trace. -->

## Rollback plan

<!-- If this deploys badly, how do we undo it? (Coolify redeploy prev image /
revert commit / restore pre-deploy snapshot for migrations) -->
