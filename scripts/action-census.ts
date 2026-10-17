/**
 * Action census — every write handler fired with a *valid-shaped* request.
 *
 * Complement to fuzz-sweep: instead of "does it survive malformed input",
 * this answers "does the action actually execute a real request". For each
 * discovered route it sends a domain-realistic body (real seed IDs in
 * dynamic segments, plausible fields) and classifies the outcome:
 *
 *   2xx            → executed (real mutation or legal no-op)
 *   400/409/422    → alive + validating (needs a fuller body — fine)
 *   401/403        → permission-gated (fine)
 *   404 JSON-error → reachable, entity not found (fine)
 *   405            → method not implemented on this route
 *   5xx / non-JSON → bug
 *
 * The finding class of interest: routes that never produce ANY reachable
 * signal under a well-formed request — dead handlers, wrong paths, or
 * bodies so strict no valid request can be formed.
 *
 * Usage: BASE=http://localhost:3200 npx tsx scripts/action-census.ts
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
      email: process.env.PROBE_EMAIL ?? "phone+917017988293@nirman.internal",
      password: process.env.PROBE_PASS ?? "nirman123",
    }),
    redirect: "manual",
  });
  COOKIE = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!COOKIE) throw new Error(`login failed: ${res.status}`);
}
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: COOKIE, origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await res.text();
  let isJson = false;
  try { JSON.parse(t); isJson = true; } catch {}
  return { status: res.status, isJson, raw: t };
}

// Real seed ids for dynamic segments — per resource family.
const SEED_IDS: Record<string, string> = {
  id: "cmtv3x4uu0008vlp0jl0r5zcw",         // generic — an employee id; per-route lookups will 404 cleanly
  materialId: "cmv0qabq9006hvlt7eyfga17r",
  projectId: "cmtwhwzer000pvlt3cth8e8qo",
  customerId: "cmtwi53250001vljm6ru892z6",
  supplierId: "cmv0q7nid0066vlt7x2vfn963",
  employeeId: "cmtv3x4uu0008vlp0jl0r5zcw",
  locationId: "cmv0q8a4h006avlt72rifonze",
};

// A domain-plausible "generic valid" body — hits the common field names
// most schemas ask for. Not meant to satisfy every schema; meant to be
// well-formed enough that a 400 = "needs more", not "malformed".
const GENERIC_BODY = {
  name: "census-test", title: "census", description: "census",
  amount: 100, qty: 1, quantity: 1, unitCost: 10, rate: 10,
  status: "ACTIVE", type: "MANUAL", action: "submit",
  date: "2026-10-17", fromDate: "2026-01-01", toDate: "2026-12-31",
  notes: "census", reason: "census", remarks: "census",
  email: "census@nirman.internal", phone: "+919999000001",
  projectId: SEED_IDS.projectId, materialId: SEED_IDS.materialId,
  customerId: SEED_IDS.customerId, supplierId: SEED_IDS.supplierId,
  employeeId: SEED_IDS.employeeId, locationId: SEED_IDS.locationId,
  lines: [{ materialId: SEED_IDS.materialId, qty: 1, unitCost: 10 }],
  items: [{ materialId: SEED_IDS.materialId, qty: 1 }],
};

const SKIP = [
  /^auth\//, /^auth$/, /^cron\//, /^webhooks?\//, /^uploads?\//, /^ocr\//,
  /^push/, /^payments?\//, /^demo-login/, /^health$/, /^telemetry/, /^sentry/,
  /^dev\//, /^debug\//, /^seed/, /^migrate/, /^backups?\//, /^restore/,
  /^email/, /^sms\//, /^whatsapp/, /^notify/, /^sync\b/, /^gl\/sync/,
  /^integrations?\//, /^capacitor/, /^mobile-pair/, /^share\//, /^portal\/auth/,
];

interface Route { method: string; url: string; src: string }
function discover(): Route[] {
  const out: Route[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name !== "route.ts") continue;
      const rel = relative(API_DIR, dir);
      if (SKIP.some((re) => re.test(rel))) continue;
      // Substitute the real id only for the segment name that exists.
      const url = "/api/" + rel.replace(/\[([^\]]+)\]/g, (_m, seg) => SEED_IDS[seg] ?? SEED_IDS.id);
      const src = readFileSync(p, "utf8");
      const methods = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
      for (const method of methods) out.push({ method, url, src });
    }
  };
  walk(API_DIR);
  return out;
}

const tally: Record<string, number> = {};
const byStatus: Record<string, string[]> = {};
function bump(status: number, route: string) {
  const k = String(status);
  tally[k] = (tally[k] ?? 0) + 1;
  (byStatus[k] ??= []).push(route);
}

async function main() {
  await login();
  const routes = discover();
  console.log(`action-census: ${routes.length} handlers on ${BASE}`);
  const writes = routes.filter((r) => r.method !== "GET");

  for (const r of writes) {
    const hasBody = r.method !== "DELETE" || /\[/.test(r.url);
    const { status, isJson, raw } = await api(r.method, r.url, hasBody ? GENERIC_BODY : undefined);
    bump(status, `${r.method} ${r.url}`);
    if (status >= 500) {
      console.log(`  5xx ${r.method} ${r.url} → ${raw.slice(0, 100).replace(/\s+/g, " ")}`);
    } else if (status >= 400 && !isJson) {
      console.log(`  non-JSON err ${r.method} ${r.url} → ${status}`);
    }
  }

  console.log("\n═══ STATUS MATRIX ═══");
  for (const [k, v] of Object.entries(tally).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${k}: ${v}`);
  }
  // The unreachable findings: routes whose ONLY response to a well-formed
  // request is 405 (method absent) or a non-JSON 4xx (framework rejected).
  console.log("\n═══ ROUTES THAT ONLY EVER 405 ═══");
  for (const r of byStatus["405"] ?? []) console.log("  " + r);
}

main().catch((e) => { console.error(e); process.exit(1); });
