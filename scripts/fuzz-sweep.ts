/**
 * Fuzz sweep — Layer 4 extension: auto-discovered API surface coverage.
 *
 * Enumerates every apps/web/src/app/api/** /route.ts, maps it to a URL,
 * substitutes a never-existent `fz-` id into dynamic segments, and fires the
 * same malformed-payload battery as fuzz-probe.ts at every exported write
 * method. Asserts:
 *   1. Never 5xx — every malformed input dies as a clean 4xx (or 401/403/404)
 *   2. Response is JSON (not a stack dump / HTML error page)
 *   3. Malformed payloads that get ACCEPTED (<400 on a write) are flagged —
 *      a real validation gap (rows may be written — they carry `fz` markers).
 *
 * Side-effect routes are skipped: auth flows, webhooks, crons, uploads,
 * ocr, push, payment callbacks, demo-login, health, telemetry, dev-only
 * utilities — those are tested by their own harnesses or mutate external
 * state (mail/push/ledger-side-effects) rather than validating JSON bodies.
 *
 * Usage: BASE=http://localhost:3200 PROBE_EMAIL=... npx tsx scripts/fuzz-sweep.ts
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
  const t = await res.text();
  let isJson = false;
  try { JSON.parse(t); isJson = true; } catch { /* html/text */ }
  return { status: res.status, isJson, raw: t };
}

const MALFORMED: [string, unknown][] = [
  ["empty object", {}],
  ["null root", null],
  ["array root", []],
  ["string root", "x"],
  ["all-null fields", { amount: null, qty: null, id: null, name: null }],
  ["negative amount", { amount: -500, qty: -3 }],
  ["zero amount", { amount: 0, qty: 0 }],
  ["huge amount", { amount: 9e15, qty: 9e15 }],
  ["string-for-number", { amount: "abc", qty: "lots" }],
  ["object-for-string", { name: { evil: true }, materialId: { x: 1 } }],
  ["array-for-object", { lines: "not-an-array", notes: [] }],
  ["bogus id", { id: "fz-nonexistent", materialId: "fz-nonexistent", saleId: "fz-nonexistent", entityId: "fz-nonexistent" }],
  ["sql-ish string", { notes: "'; DROP TABLE \"MaterialSale\";--", referenceNo: "' OR '1'='1" }],
  ["oversized string", { notes: "x".repeat(60_000) }],
  ["fz-marked junk", { notes: "fzjunk", referenceNo: "fzjunk", name: "fzjunk" }],
];

/** Route prefixes that must not receive fuzz writes. */
const SKIP = [
  /^auth\//, /^auth$/, /^cron\//, /^webhooks?\//, /^uploads?\//, /^ocr\//,
  /^push/, /^payments?\//, /^demo-login/, /^health$/, /^telemetry/, /^sentry/,
  /^dev\//, /^debug\//, /^seed/, /^migrate/, /^backups?\//, /^restore/,
  /^email/, /^sms\//, /^whatsapp/, /^notify/, /^sync\b/, /^gl\/sync/,
  /^integrations?\//, /^capacitor/, /^mobile-pair/, /^share\//, /^portal\/auth/,
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
      const url = "/api/" + rel.replace(/\[[^\]]+\]/g, "fz-nonexistent");
      if (SKIP.some((re) => re.test(rel))) continue;
      const src = readFileSync(p, "utf8");
      const methods = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+(POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
      for (const method of methods) out.push({ method, url });
    }
  };
  walk(API_DIR);
  return out;
}

let pass = 0, fail = 0;
const findings: string[] = [];
async function fuzz(r: Route, bodyless: boolean) {
  for (const [label, body] of MALFORMED) {
    const { status, isJson, raw } = await api(r.method, r.url, body);
    if (status >= 500) {
      findings.push(`${r.method} ${r.url} [${label}] → 5xx ${status}: ${raw.slice(0, 140).replace(/\s+/g, " ")}`);
      fail++; continue;
    }
    // JSON assertion: error responses should be JSON bodies, not HTML pages.
    if (status >= 400 && !isJson && !raw.trimStart().startsWith("{")) {
      findings.push(`${r.method} ${r.url} [${label}] → ${status} non-JSON error body`);
      fail++; continue;
    }
    if (status < 400 && r.method === "POST" && !bodyless) {
      // A POST that accepts malformed input = a validation gap.
      findings.push(`${r.method} ${r.url} [${label}] → ${status} accepted`);
      fail++; continue;
    }
    pass++;
  }
}

async function main() {
  await login();
  const routes = discover();
  // Body-less action endpoints — legitimately ignore the request body
  // (idempotent syncs/seeds/triggers). "accepted" is designed behavior.
  const BODYLESS = /(^|\/)(sync|seed|send-|dedup|consent|reminder|reseed|activate|trigger|run|gl\/accounts|accounts$)/;
  console.log(`fuzz-sweep @${BASE} — ${routes.length} write handlers × ${MALFORMED.length} malformed`);
  // Serial: keeps the run under the write rate-limit refill and makes
  // server-side crash signatures easy to attribute.
  for (let i = 0; i < routes.length; i++) {
    await fuzz(routes[i], BODYLESS.test(routes[i].url));
    if ((i + 1) % 50 === 0) console.log(`  …${i + 1}/${routes.length}`);
  }
  console.log(`\n═══ RESULT: ${pass} clean · ${fail} findings (${routes.length} handlers)`);
  for (const f of findings) console.log("   " + f);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
