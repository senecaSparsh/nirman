# Verification battery — rerun before every client onboarding

Every script hits a live build (`BASE=`, default `http://localhost:3200`,
or `https://nirman.life` for prod). All mutate data — point them at a
scratch tenant or accept the artifacts they leave.

## Business chains (run first)

```sh
BASE=http://localhost:3200 node scripts/chain-runner.mjs
```

6 chains as the real SRG personas: procurement (req→approve→PO→GRN→issue),
sale lifecycle, subcontractor billing (WO→MB→verify→RA bill), attendance/
payroll guards, land→project reads, gate-pass full cycle.

## What-if waves

```sh
for w in 1 2 3 4 5 6 7 8; do
  BASE=http://localhost:3200 node scripts/whatif-wave$w.mjs
done
# wave 1 file is named whatif-runner.mjs
```

- **w1** — off-site duty, geofence config, role change, delegation,
  deactivated employee, negative stock, dup phone, locked-month,
  self-approval
- **w2** — double-sale (seq + race), idempotent replay, scope/demotion/
  deactivation mid-session, orphan-approve rescue, PII visibility,
  buddy-punch, GPS-less, 24h cap, big write, checkout-no-checkin
- **w3** — multi-tenancy: switch, zero leak, ID-guess 404, Tenant-B seal,
  employee isolation, export perms, forged cookie, member-remove
- **w4** — destructive: deletes with refs, approved-PO immutability,
  double-approve race, -5/0/9e15 qty+money, SQL/emoji/XSS/giant strings,
  concurrent edit, fabricated IDs, month boundary, admin-only reach
- **w5** — money integrity: trial balance dr=cr, GL scope, export perms,
  2-device race, bulk-import atomicity, audit coverage, PO numbering race
- **w6** — math reconciliation: report sums, movement ledger consistency,
  owner-gone resilience (ADMIN+delegation), state-machine completeness,
  rejected-resubmit, empty lists, fractional rupees
- **w7** — transfer↔gate-pass chain (auto GP → approve → auto-dispatch),
  notifications, global search, over-receipt race, reject→terminal,
  cheque reuse
- **w8** — petty-cash overspend, gate-exit-before-approve, leave-overlap
  at approve, waiveQuotes, audit scope, self-check-in own-only,
  cross-scope read

## UX personas (Playwright, serial — auth rate limit is 5/min)

```sh
cd apps/web && PROBE_BASE=http://localhost:3200 \
  npx playwright test --config=playwright.probe.config.ts \
  probe/ux-persona.spec.ts --workers=1
```

8 checks: all 5 roles sign in through the real UI → land → scoped nav →
work page → forbidden-page denial; forced password change; wrong-password
inline error; mobile /m shell. ~11 min (70s spacing per sign-in).

## Repo suites

```sh
pnpm --filter @nirman/services test      # 1779 unit tests
COOKIE_JAR=/tmp/jar-OWNER BASE=http://localhost:3200 \
  ./scripts/verify-workflows-full.sh      # 72 live state-machine checks
pnpm typecheck && pnpm lint
```

## Restore drill

```sh
ssh nirman-vps 'docker exec backup-* /backup.sh'   # fresh dump + B2 verify
# pull /backups/pg/latest.sql.gz → createdb scratch → gunzip|psql → count rows
```

## Known-safe patterns (not bugs)

- "Dead" buttons on export/print/tabs/stat-cards = probe artifacts
- PENDING leave duplicates coexist — overlap enforced at APPROVE
- RECEIVED payments on cancelled sales = receipt record + GL refund entry
- 485 NULL `toLocationId` movements = outbound consumption, not orphans
- Rate-limit 429s during probing = the limiter working
