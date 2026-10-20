/* Breakscale load model of the nirman.life production topology.
 *
 * The stack as it actually runs on the VPS (see AGENTS.md + Coolify):
 *   clients → coolify-proxy (Traefik) → Next.js app (single container,
 *   heap ~1.6GB, concur ~50, prisma pool 16) → Postgres container.
 *   A scheduler container fires sweeps every 15 min. No cache, no queue —
 *   notifications and reminders run inline with the request that emits them.
 */
import { buildTopology } from "../../../breakscale/mcp/src/design";
import { runDesign, describeRun, type RunOptions } from "../../../breakscale/mcp/src/run";

const BASE = {
  nodes: [
    { id: "users", kind: "client", label: "Site + office users" },
    { id: "proxy", kind: "lb", label: "coolify-proxy (Traefik)" },
    {
      id: "app", kind: "service", label: "Next.js (SSR+API)",
      // concur ~50 per the 2GB auto-memory profile; SSR pages run 10-30
      // prisma queries per render, so 120ms mean service is honest.
      config: { capacity: 50, serviceMs: 120, serviceCv: 0.7, queueLimit: 64 },
    },
    {
      id: "db", kind: "db", label: "Postgres (same VPS)",
      // prisma connection_limit=16 — the app cannot open more slots than
      // this; GL postings are multi-statement txns so lockMs bites at writes.
      config: { capacity: 16, serviceMs: 8, serviceCv: 0.7, queueLimit: 48, lockMs: 15 },
    },
    { id: "cron", kind: "cron", label: "Scheduler sweeps (15min)" },
  ],
  edges: [
    { from: "users", to: "proxy" },
    { from: "proxy", to: "app" },
    { from: "app", to: "db" },
    { from: "cron", to: "db" },
  ],
};

const rpsSweep = [20, 60, 120, 200, 350, 600, 1000];
const opts: RunOptions = { seconds: 30, seed: 7, budgetMs: 8000 };

for (const rps of rpsSweep) {
  const design = JSON.parse(JSON.stringify(BASE));
  (design.nodes[0] as { config?: Record<string, number> }).config = { rps };
  const res = buildTopology(design);
  if (!res.ok) { console.log("topology rejected", res.errors); process.exit(1); }
  const run = runDesign(res.topology, { ...opts, seed: 7 + rps });
  console.log(`\n===== offered ${rps} rps =====`);
  console.log(describeRun(res.topology, run, opts).split("\n").slice(0, 14).join("\n"));
}
