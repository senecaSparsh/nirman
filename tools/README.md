# Testing-tooling survey (2026)

Tools that attack this stack from different directions, ranked by what
they'd find first.

## Load + scale modelling

- **Breakscale** — discrete-event architecture simulator with an MCP
  server. Model the topology, drag traffic up, watch what breaks. Wired
  at `tools/loadmodel/`; the app-tier wall and compound-load risk above
  came from it.
- **k6** — real HTTP load tests in JS. The honest version of the
  Breakscale numbers: hit the actual dev server, measure real p99s.
- **autocannon** — zero-config HTTP load for quick smoke (`npx autocannon
-c 50 -d 30 http://localhost:3000/api/health`).
- **pgbench** — Postgres-side load: isolates the DB tier the way
  Breakscale models it.

## Fault injection / chaos

- **Toxiproxy** — TCP proxy that injects latency/connection drops.
  Answers "what happens to a GL transaction when Postgres takes 5s" —
  the exact thing the serializable-retry layer claims to survive.
- **Pumba** — container chaos (kill/pause/netem the Coolify stack).
- **Chaos Monkey class** — overkill for one VPS; skip.

## Verification already in the repo

- **Playwright e2e** (`apps/web/e2e`) — ~300-route smoke + multi-role flows.
- **verify-workflows-full.sh** — 70 checks over live HTTP state machines.
- **Vitest** — 1,800+ service/unit tests.
- **Lighthouse CI** — frontend perf + a11y; would catch the heavy-page
  regression the model flags as "faster pages = 2× capacity".
