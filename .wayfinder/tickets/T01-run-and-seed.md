# T01 — Get the app running with seeded, realistic data

> Label: `wayfinder:task` · Status: **open** · Blocks: T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12

## Question

Can a developer clone this repo, start Postgres + the dev server, sign in, and see a workspace
populated with realistic data (companies, projects, materials, POs, receipts, sales) — so that
every subsequent module-verification ticket has something to click through?

This is a **task**, not a decision: nothing to decide, but every verification ticket is blocked
until the app runs with data. Resolve by doing the work, then recording the resulting facts
(seed command, seed script location, default login credentials, any setup gotchas hit) that later
tickets depend on.

## Checklist

- [ ] `docker compose up -d` starts Postgres on 5433
- [ ] `pnpm install` + `pnpm db:generate` + `pnpm db:push` succeed
- [ ] Determine whether a seed script exists (`packages/db/prisma/seed*` or similar). If not, that's
      a finding — flag it; verification tickets will need synthetic data created inline.
- [ ] `pnpm dev` starts on 3000 (or 3001); sign-in page loads
- [ ] Identify or create a default user + company; record the credentials
- [ ] Confirm the dashboard (`/`) renders with at least one project, one material, one PO
- [ ] Record: exact commands, seed location, credentials, any errors hit and how worked around

## Resolution

_(filled on close — what was done + facts later tickets depend on)_
