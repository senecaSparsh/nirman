/**
 * Role-matrix probe — permission boundary verification at API scale.
 *
 * Signs in as a low-privilege role (default SUPERVISOR — site-level, can
 * do operational writes but must not touch money/admin) and fires a small
 * payload battery at every write handler. Asserts:
 *   1. Never 5xx — a denied request must fail cleanly, not crash on the
 *      permission gate's ordering.
 *   2. Any accepted write (200/201 on POST/PATCH/PUT/DELETE) is flagged
 *      for review against the permission matrix — some are legitimate
 *      (supervisors DO log attendance/DPRs), some are escalation bugs.
 *
 * Usage: BASE=http://localhost:3200 ROLE=SUPERVISOR PROBE_EMAIL=… npx tsx scripts/role-matrix.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3200";
const API_DIR = join(__dirname, "..", "apps", "web", "src", "app", "api");

let COOKIE = "";
async function login() {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: BASE },
    body: JSON.stringify({
      email: process.env.PROBE_EMAIL ?? "phone+917302920213@nirman.internal", // SUPERVISOR
      password: process.env.PROBE_PASS ?? "nirman123",
    }),
    redirect: "manual",
  });
  const setC = res.headers.getSetCookie?.() ?? [];
  COOKIE = setC.map((c) => c.split(";")[0]).join("; ");
  if (!COOKIE) throw new Error(`login failed: ${res.status}`);
}
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: COOKIE, origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, raw: await res.text() };
}

// Valid-looking fz bodies + the two shapes most likely to slip past a gate.
const PAYLOADS: [string, unknown][] = [
  ["fz-marked", { notes: "fzjunk", name: "fzjunk", referenceNo: "fzjunk", entityId: "fz-nonexistent", id: "fz-nonexistent", amount: 1, qty: 1 }],
  ["empty object", {}],
  ["action-ish", { action: "approve", id: "fz-nonexistent" }],
];

const SKIP = [
  /^auth\//, /^auth$/, /^cron\//, /^webhooks?\//, /^uploads?\//, /^ocr\//,
  /^push/, /^payments?\//, /^demo-login/, /^health$/, /^telemetry/, /^sentry/,
  /^dev\//, /^debug\//, /^seed/, /^migrate/, /^backups?\//, /^restore/,
  /^email/, /^sms\//, /^whatsapp/, /^notify/, /^integrations?\//, /^capacitor/,
  /^mobile-pair/, /^share\//, /^portal\/auth/, /^company\/switch/, // session ops, not perm-gated
];

interface Route { method: string; url: string }
function discover(): Route[] {
  const out: Route[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name !== "route.ts") continue;
      const rel = relative(API_DIR, dir);
      if (SKIP.some((re) => re.test(rel))) continue;
      const url = "/api/" + rel.replace(/\[[^\]]+\]/g, "fz-nonexistent");
      const src = readFileSync(p, "utf8");
      const methods = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+(POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
      for (const method of methods) out.push({ method, url });
    }
  };
  walk(API_DIR);
  return out;
}

let pass = 0, fail = 0;
const fiveHundred: string[] = [];
const accepted: string[] = [];
const denialCodes = new Map<number, number>();

async function probe(r: Route) {
  for (const [label, body] of PAYLOADS) {
    // Pace under the write rate-limiter's ~20/s sustained refill — a 429 is
    // capacity, not a permission boundary.
    await new Promise((s) => setTimeout(s, 60));
    const { status, raw } = await api(r.method, r.url, body);
    if (status >= 500) {
      fiveHundred.push(`${r.method} ${r.url} [${label}] → 5xx ${status}: ${raw.slice(0, 120).replace(/\s+/g, " ")}`);
      fail++; continue;
    }
    if (status < 400) {
      accepted.push(`${r.method} ${r.url} [${label}] → ${status}`);
      fail++; continue;
    }
    denialCodes.set(status, (denialCodes.get(status) ?? 0) + 1);
    pass++;
  }
}

async function main() {
  await login();
  const routes = discover();
  console.log(`role-matrix @${BASE} — ${routes.length} write handlers × ${PAYLOADS.length} payloads as ${process.env.PROBE_EMAIL ?? "SUPERVISOR"}`);
  for (let i = 0; i < routes.length; i++) {
    await probe(routes[i]);
    if ((i + 1) % 60 === 0) console.log(`  …${i + 1}/${routes.length}`);
  }
  console.log(`\n═══ RESULT: ${pass} denied-cleanly · ${fail} flagged`);
  console.log("  denial codes:", [...denialCodes.entries()].map(([c, n]) => `${c}×${n}`).join("  "));
  if (fiveHundred.length) {
    console.log("\n  5xx (crash on denied path):");
    for (const f of fiveHundred) console.log("   " + f);
  }
  if (accepted.length) {
    console.log("\n  accepted writes (review against perm matrix):");
    for (const f of accepted) console.log("   " + f);
  }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
