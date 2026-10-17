/**
 * Action driver — every distinct action verb executed against seeded state.
 *
 * Two action surfaces:
 *   1. Enum actions — PATCH routes with `action: z.enum([...])` (11 routes)
 *   2. Dedicated subroutes — POST /api/x/[id]/<verb> (~102 routes)
 *
 * For each action, fires a domain-shaped request at a real seed entity and
 * classifies: executed (2xx), clean guard (400/404/409/422 — wrong state is
 * legal), permission (401/403), or BUG (5xx / non-JSON / hang).
 *
 * This complements verify-workflows-full.sh (deep legal-state chains) by
 * covering the full verb vocabulary breadth-wise.
 *
 * Usage: BASE=http://localhost:3200 npx tsx scripts/action-driver.ts
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
  if (!COOKIE) throw new Error("login failed");
}
async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: COOKIE, origin: BASE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await res.text();
  let j: unknown = null;
  try { j = JSON.parse(t); } catch {}
  return { status: res.status, isJson: j !== null, raw: t, body: j };
}

// ── seed ids for the entity families ──────────────────────────────────
const IDS = {
  employee: "cmtv3x4uu0008vlp0jl0r5zcw",
  material: "cmv0qabq9006hvlt7eyfga17r",
  project: "cmtwhwzer000pvlt3cth8e8qo",
  supplier: "cmv0q7nid0066vlt7x2vfn963",
  customer: "cmtwi53250001vljm6ru892z6",
  company: "cmtv3x4t50000vlp0b23vdtxe",
  location: "cmv0q8a4h006avlt72rifonze",
};

// Per-family live ids (queried from the seed DB) so each enum route fires
// at an entity it actually owns — a wrong-family id just short-circuits
// at the lookup and never reaches the action logic.
const ROUTE_IDS: Record<string, string> = {
  "purchase-orders": "vfy179221879430888",      // DRAFT
  "gate-passes": "vfy179221879216830",          // PENDING
  "expense-claims": "cmvakcxd503d2vl2c3adp5ugh", // PAID
  expenses: "cmvc4n0ps012ovl10xckaudfc",        // DRAFT
  transfers: "cmvc4ky8200f7vl10qehachbf",
  "change-orders": "vfy179221879124466",        // IMPLEMENTED
  "safety/hazards": "vfy179221879114964",       // RESOLVED
  "safety/inspections": "vfy179221879211732",   // COMPLETED
  "safety/incidents": "vfy179221879125364",     // CLOSED
  "quality-control/capa": "cmvc0sm4h0084vl01nohxqf5n", // CLOSED
  "quality-control/ncr": "vfy17922187911691",   // CAPA_REQUIRED
};
function substitute(rel: string): string {
  const top = rel.split("/[id]")[0];
  const own = ROUTE_IDS[top];
  return rel.replace(/\[([^\]]+)\]/g, (_m, seg: string) => {
    if (seg === "id" && own) return own;
    const s = seg.toLowerCase();
    for (const [k, v] of Object.entries(IDS)) if (s.includes(k)) return v;
    return own ?? IDS.employee;
  });
}

const SKIP = [
  /^auth\//, /^auth$/, /^cron\//, /^webhooks?\//, /^uploads?\//, /^ocr\//,
  /^push/, /^payments?\//, /^demo-login/, /^health$/, /^telemetry/, /^sentry/,
  /^dev\//, /^debug\//, /^seed/, /^migrate/, /^backups?\//, /^restore/,
  /^email/, /^sms\//, /^whatsapp/, /^notify/, /^sync\b/, /^gl\/sync/,
  /^integrations?\//, /^capacitor/, /^mobile-pair/, /^share\//, /^portal\/auth/,
];

// Per-route domain bodies — enough to get past zod and hit the real
// handler logic. Anything not listed gets the generic shape.
const ROUTE_BODIES: Record<string, unknown> = {
  "attendance/[id]/review": { action: "approve", notes: "driver" },
  "purchase-orders/[id]/receive": {
    lines: [{ materialId: IDS.material, qtyReceived: 1, unitCost: 10 }],
  },
  "transfers/[id]": { action: "dispatch" },
  "materials/[id]/adjust-stock": {
    locationId: IDS.location, qtyChange: 1, reason: "driver", type: "ADJUSTMENT_IN",
  },
  "petty-cash/[id]/spend": { amount: 10, description: "driver", category: "OTHER" },
  "petty-cash/[id]/topups": { amount: 100, notes: "driver" },
  "sales/[id]/pay-commission": { amount: 10, method: "BANK", referenceNo: "drv" },
  "material-sales/[id]/payments": { amount: 10, method: "BANK", referenceNo: "drv" },
  "payment-schedules/items/[id]/pay": { amount: 10, method: "BANK", paidDate: "2026-10-17" },
  "tenancies/[id]/payments": { amount: 10, method: "BANK", period: "2026-10" },
  "employees/[id]/advances": { amount: 10, reason: "driver" },
  "employees/[id]/benefits": { type: "OTHER", amount: 10, label: "driver" },
  "employees/[id]/salary-components": { components: [] },
  "tasks/[id]/comments": { body: "driver comment" },
  "tasks/[id]/time": { action: "start" },
  "tasks/[id]/subtasks": { title: "driver subtask" },
  "tasks/[id]/dependencies": { dependsOnTaskId: IDS.employee },
  "projects/[id]/phases": { name: "driver phase" },
  "projects/[id]/reallocate": { allocations: [] },
  "renovations/[id]/costs": { category: "OTHER", amount: 10, description: "driver" },
  "land-purchases/[id]/cost-components": { category: "OTHER", amount: 10, label: "driver" },
  "land-purchases/[id]/payment": { amount: 10, method: "BANK", paidDate: "2026-10-17" },
  "land-purchases/payments/[id]/cheque": { action: "clear" },
  "sales/payments/[id]/cheque": { action: "clear" },
  "material-sales/payments/[id]/cheque": { action: "clear" },
  "leads/[id]/activities": { type: "NOTE", notes: "driver" },
  "quotes/[id]/select": {},
  "users/[id]/permissions": { permissions: [] },
  "users/[id]/scope": { scopeType: "PROJECT", entries: [{ projectId: IDS.project }] },
  "users/[id]/reset-password": { newPassword: "NirmanTestPass2026" },
  "vehicles/[id]/trips": { startTime: "2026-10-17T08:00:00Z", startKm: 100 },
  "calls/[id]/notes": { body: "driver note" },
  "dprs/[id]/variance": { action: "acknowledge" },
  "workflows/[id]/runs": { trigger: { type: "MANUAL" } },
  "expense-claims/[id]/lines": { lines: [] },
};

const GENERIC = {
  name: "driver", title: "driver", description: "driver", notes: "driver",
  amount: 10, qty: 1, quantity: 1, reason: "driver",
  action: "submit",
  materialId: IDS.material, projectId: IDS.project, supplierId: IDS.supplier,
  employeeId: IDS.employee, customerId: IDS.customer, locationId: IDS.location,
  companyId: IDS.company,
  lines: [{ materialId: IDS.material, qty: 1 }],
  items: [{ materialId: IDS.material, qty: 1 }],
  date: "2026-10-17",
};

interface Action { route: string; method: string; url: string; actions: string[] }

function discoverActions(): Action[] {
  const out: Action[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name !== "route.ts") continue;
      const rel = relative(API_DIR, dir);
      if (SKIP.some((re) => re.test(rel))) continue;
      const src = readFileSync(p, "utf8");
      const url = "/api/" + substitute(rel);
      const methods = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+(POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
      if (!methods.length) continue;
      // Extract enum action verbs from this route's schemas.
      const verbs = new Set<string>();
      for (const m of src.matchAll(/z\.enum\(\[([^\]]+)\]\)/g)) {
        for (const v of m[1].matchAll(/"([^"]+)"/g)) {
          if (/^(submit|approve|reject|resubmit|cancel|close|delete|dispatch|complete|confirmExit|start|stop|pay|review|resolve|mitigate|investigate|verify|implement|order|shortClose|addLine|updateEta|mark_paid|process|activate|terminate|escalate|clear|bounce|acknowledge|restore|corrective_done|preventive_done|returnToSource|receive|link|unlink|assign)$/.test(v[1])) {
            verbs.add(v[1]);
          }
        }
      }
      out.push({ route: rel, method: methods[0], url, actions: [...verbs] });
    }
  };
  walk(API_DIR);
  return out;
}

const tally: Record<string, string[]> = { executed: [], guarded: [], permission: [], crash: [], other: [] };
function record(cls: keyof typeof tally, what: string) { tally[cls].push(what); }

async function main() {
  await login();
  const routes = discoverActions();
  const withVerbs = routes.filter((r) => r.actions.length);
  const subroutes = routes.filter((r) => !r.actions.length && /\[.*\]\/.+/.test(r.route));

  console.log(`action-driver: ${withVerbs.length} enum routes, ${subroutes.length} dedicated subroutes`);

  // ── enum actions: fire each verb at the route's seed entity ──
  for (const r of withVerbs) {
    for (const verb of r.actions) {
      const body = { ...(ROUTE_BODIES[r.route] as object | undefined), ...GENERIC, action: verb };
      const { status, isJson, raw } = await api(r.method, r.url, body);
      await new Promise((x) => setTimeout(x, 60)); // stay under the write limiter
      const tag = `${verb} @ ${r.route}`;
      if (status >= 500) record("crash", `${tag} → ${status} ${raw.slice(0, 80)}`);
      else if (!isJson && status >= 400) record("crash", `${tag} → ${status} non-JSON`);
      else if (status < 300) record("executed", `${tag} → ${status}`);
      else if (status === 401 || status === 403) record("permission", `${tag} → ${status}`);
      else record("guarded", `${tag} → ${status}`);
    }
  }

  // ── dedicated action subroutes: fire the route body ──
  for (const r of subroutes) {
    const body = ROUTE_BODIES[r.route] ?? GENERIC;
    const { status, isJson, raw } = await api(r.method, r.url, body);
    await new Promise((x) => setTimeout(x, 60));
    const tag = `${r.method} ${r.route}`;
    if (status >= 500) record("crash", `${tag} → ${status} ${raw.slice(0, 80)}`);
    else if (!isJson && status >= 400) record("crash", `${tag} → ${status} non-JSON`);
    else if (status < 300) record("executed", `${tag} → ${status}`);
    else if (status === 401 || status === 403) record("permission", `${tag} → ${status}`);
    else record("guarded", `${tag} → ${status}`);
  }

  console.log("\n═══ EXECUTED ═══");
  for (const t of tally.executed) console.log("  " + t);
  console.log("\n═══ GUARDED (legal state-reject) ═══");
  for (const t of tally.guarded) console.log("  " + t);
  console.log("\n═══ PERMISSION ═══");
  for (const t of tally.permission) console.log("  " + t);
  console.log("\n═══ CRASHES ═══");
  for (const t of tally.crash) console.log("  " + t);
  console.log(`\n═══ RESULT: ${tally.executed.length} executed, ${tally.guarded.length} guarded, ${tally.permission.length} permission, ${tally.crash.length} crashes ═══`);
}

main().catch((e) => { console.error(e); process.exit(1); });
