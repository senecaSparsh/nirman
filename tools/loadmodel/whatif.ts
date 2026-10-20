import { buildTopology } from "../../../breakscale/mcp/src/design";
import { runDesign, describeRun, type RunOptions } from "../../../breakscale/mcp/src/run";

function model(opts: { appSvcMs?: number; dbSvcMs?: number; appCap?: number; dbCap?: number; rps: number; cron?: boolean }) {
  return {
    nodes: [
      { id: "users", kind: "client", label: "users", config: { rps: opts.rps } },
      { id: "proxy", kind: "lb" },
      { id: "app", kind: "service", config: { capacity: opts.appCap ?? 50, serviceMs: opts.appSvcMs ?? 120, serviceCv: 0.7, queueLimit: 64 } },
      { id: "db", kind: "db", config: { capacity: opts.dbCap ?? 16, serviceMs: opts.dbSvcMs ?? 8, serviceCv: 0.7, queueLimit: 48, lockMs: 15 } },
      ...(opts.cron ? [{ id: "cron", kind: "cron", config: { intervalMs: 15000, batchSize: 40 } }] : []),
    ],
    edges: [
      { from: "users", to: "proxy" },
      { from: "proxy", to: "app" },
      { from: "app", to: "db" },
      ...(opts.cron ? [{ from: "cron", to: "db" }] : []),
    ],
  };
}

const opts: RunOptions = { seconds: 30, seed: 11, budgetMs: 8000 };
const scenarios: [string, Parameters<typeof model>[0]][] = [
  ["SLOW QUERY DAY — reports/dashboard push db serviceMs 8→40ms", { rps: 200, dbSvcMs: 40 }],
  ["SLOW QUERY at 350 rps (app was 81% busy already)", { rps: 350, dbSvcMs: 40 }],
  ["CRON BURST — 15-min sweep storm while users are at 200 rps", { rps: 200, cron: true }],
  ["SCALE-OUT — 2 app replicas at 600 rps", { rps: 600, appCap: 100 }],
  ["FASTER PAGES — serviceMs 120→60 (cached reads) at 600 rps", { rps: 600, appSvcMs: 60 }],
];
for (const [name, cfg] of scenarios) {
  const res = buildTopology(model(cfg));
  if (!res.ok) { console.log(name, "rejected:", res.errors); continue; }
  const run = runDesign(res.topology, opts);
  console.log(`\n===== ${name} =====`);
  console.log(describeRun(res.topology, run, opts).split("\n").slice(0, 12).join("\n"));
}
