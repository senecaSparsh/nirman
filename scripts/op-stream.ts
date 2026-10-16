/**
 * Op-stream property test — Layer 3 of the testing roadmap.
 *
 * fast-check generates random command sequences over the stock domain
 * (issue / execute / cancel / transfer lifecycle) and drives them against the
 * REAL dev API + DB. After every command the probe asserts the ledger
 * invariants on the fixture rows:
 *
 *   - StockLocationItem.qty >= 0 for the probe (location, material) pair
 *   - location qty == Σ movements for that pair (cache matches ledger)
 *   - every probe-created CANCELLED MaterialIssue nets to zero movement
 *     (phantom-stock regression guard)
 *
 * On failure fast-check shrinks to the minimal counterexample — the printed
 * sequence is the smallest op stream that breaks an invariant.
 *
 * Usage:  BASE=http://localhost:3000 npx tsx scripts/op-stream.ts [--seed N] [--runs 30] [--ops 60]
 * Dev/staging only — mutates the DB.
 */
import { execFileSync } from "node:child_process";
import * as fc from "fast-check";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PS = `psql -h localhost -U postgres -d nirman_inventory -tAc`.split(" ");
const seedArg = Number(process.argv.find((a, i) => process.argv[i - 1] === "--seed") ?? NaN);
const runsArg = Number(process.argv.find((a, i) => process.argv[i - 1] === "--runs") ?? NaN);
const opsArg = Number(process.argv.find((a, i) => process.argv[i - 1] === "--ops") ?? NaN);

function sql(q: string): string {
  return execFileSync(PS[0], [...PS.slice(1), q], { encoding: "utf8" }).trim();
}
const q = (s: string) => s.replace(/'/g, "''");

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Location A holds mat-test-02 (qty ~818); B is the transfer counterpart.
const LOC_A = sql(`SELECT "locationId" FROM "StockLocationItem" WHERE "materialId"='mat-test-02' AND qty>100 ORDER BY qty DESC LIMIT 1`);
const LOC_B = sql(`SELECT id FROM "StockLocation" WHERE id NOT IN ('${q(LOC_A)}') AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`);
const MATERIAL = "mat-test-02";
const PROJECT = sql(`SELECT id FROM "Project" WHERE "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1`);

// ── HTTP ──────────────────────────────────────────────────────────────────────
let COOKIE = "";
async function login() {
  const email = process.env.DEMO_LOGIN_EMAIL ?? "phone+917017988293@nirman.internal";
  const password = process.env.DEMO_LOGIN_PASSWORD ?? "nirman123";
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const sc = res.headers.get("set-cookie") ?? "";
  const m = sc.match(/better-auth\.session_token=[^;]+/);
  if (!m) {
    // fallback: phone-password
    const phone = email.match(/phone\+?(\d+)@/)?.[1];
    const res2 = await fetch(`${BASE}/api/auth/phone-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: `+${phone}`, password }),
    });
    const sc2 = res2.headers.get("set-cookie") ?? "";
    const m2 = sc2.match(/better-auth\.session_token=[^;]+/);
    if (!m2) throw new Error("no session cookie");
    COOKIE = m2[0];
    return;
  }
  COOKIE = m[0];
}
async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: COOKIE },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// ── Invariant oracle ──────────────────────────────────────────────────────────
// Asserted after EVERY command. Throws on violation → fast-check shrinks.
const probeIds = { issues: [] as string[], transfers: [] as string[] };
const notes: string[] = [];
const cmdCounts: Record<string, number> = {};
function bump(n: string) { cmdCounts[n] = (cmdCounts[n] ?? 0) + 1; }

function assertInvariants(step: string) {
  // 1. cache == ledger AND qty >= 0 for the probe pair (both locations)
  for (const loc of [LOC_A, LOC_B]) {
    const row = sql(
      `SELECT COALESCE((SELECT qty FROM "StockLocationItem" WHERE "locationId"='${q(loc)}' AND "materialId"='${q(MATERIAL)}'),0), ` +
      `COALESCE((SELECT SUM(CASE WHEN m."movementType" IN ('PURCHASE_RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','SCRAP_GENERATED','OPENING_BALANCE') THEN m.qty
                          WHEN m."movementType" IN ('TRANSFER_OUT','ISSUE_TO_PROJECT','ISSUE_TO_DEPARTMENT','ADJUSTMENT_OUT','RETURN','SALE') THEN -m.qty ELSE 0 END)
                FROM "StockMovement" m WHERE m."materialId"='${q(MATERIAL)}' AND (m."fromLocationId"='${q(loc)}' OR m."toLocationId"='${q(loc)}')),0)`,
    ).split("|");
    const [cached, ledger] = row.map(Number);
    if (cached < 0) throw new Error(`NEGATIVE STOCK @${step}: loc ${loc} qty=${cached}`);
    if (Math.abs(cached - ledger) > 0.001) {
      throw new Error(`CACHE≠LEDGER @${step}: loc ${loc} material ${MATERIAL} cached=${cached} ledger=${ledger}`);
    }
  }
  // 2. probe-created cancelled issues must net to zero movement
  for (const id of probeIds.issues) {
    const st = sql(`SELECT status FROM "MaterialIssue" WHERE id='${q(id)}'`);
    if (st !== "CANCELLED") continue;
    const r = sql(
      `SELECT COALESCE(SUM(CASE WHEN "movementType" IN ('ISSUE_TO_PROJECT','ISSUE_TO_DEPARTMENT','SALE','RETURN','TRANSFER_OUT','ADJUSTMENT_OUT') THEN qty ELSE 0 END),0),` +
      `COALESCE(SUM(CASE WHEN "movementType" IN ('ADJUSTMENT_IN','PURCHASE_RECEIPT','TRANSFER_IN','SCRAP_GENERATED','OPENING_BALANCE') THEN qty ELSE 0 END),0) ` +
      `FROM "StockMovement" WHERE "refId"='${q(id)}'`,
    ).split("|");
    if (Math.abs(Number(r[0]) - Number(r[1])) > 0.001) {
      throw new Error(`CANCELLED ISSUE UNBALANCED @${step}: ${id} out=${r[0]} in=${r[1]}`);
    }
  }
}

// ── Model ─────────────────────────────────────────────────────────────────────
interface Model {
  pendingIssues: string[];      // PENDING — execute/cancel legal
  completedIssues: string[];    // COMPLETED — cancel legal (restores stock)
  deadIssues: string[];         // CANCELLED — everything illegal
  draftTransfers: string[];     // DRAFT — dispatch/cancel legal
  transitTransfers: string[];   // IN_TRANSIT — complete/return legal
  deadTransfers: string[];      // COMPLETED/CANCELLED — everything illegal
  qtyAtA: number;               // model qty at LOC_A (start ~818, drift-tracked)
}
const pick = <T,>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];

// ── Commands ──────────────────────────────────────────────────────────────────
const arbitraryQty = fc.integer({ min: 1, max: 25 });

class IssueCreateCmd implements fc.AsyncCommand<Model, unknown> {
  constructor(readonly qty: number, readonly gated: boolean) {}
  check(): boolean { return true; }
  async run(m: Model) {
    const r = await api("POST", "/api/issue-materials", {
      fromLocationId: LOC_A, projectId: PROJECT,
      lines: [{ materialId: MATERIAL, qty: this.qty }],
      requireGatePass: this.gated,
      notes: "opstream",
    });
    const b = r.body as Record<string, unknown>;
    const id = (b.materialIssueId ?? b.issueId ?? b.id ?? (b.issue as { id?: string })?.id) as string | undefined;
    if (r.status === 201 && id) {
      probeIds.issues.push(id);
      // `pending:true` = gated path created a PENDING issue (no stock moved yet)
      if (b.pending === true) m.pendingIssues.push(id);
      else { m.completedIssues.push(id); m.qtyAtA -= this.qty; }
    } else if (r.status >= 500) {
      throw new Error(`5xx ${r.status} @ issue.create: ${JSON.stringify(r.body).slice(0, 200)}`);
    } else {
      notes.push(`issue.create → ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`);
    }
    assertInvariants(`issue.create qty=${this.qty} gated=${this.gated} → ${r.status}`);
  }
  toString() { return `issue.create(${this.qty},gated=${this.gated})`; }
}

class IssueExecuteCmd implements fc.AsyncCommand<Model, unknown> {
  check(m: Model): boolean { return m.pendingIssues.length > 0; }
  async run(m: Model) {
    const id = pick(m.pendingIssues)!;
    const r = await api("PATCH", `/api/issue-materials/${id}`, { action: "execute" });
    if (r.status === 200) {
      m.pendingIssues = m.pendingIssues.filter((x) => x !== id);
      m.completedIssues.push(id);
      const qIss = Number(sql(`SELECT COALESCE(SUM(qty),0) FROM "MaterialIssueLine" WHERE "materialIssueId"='${q(id)}'`));
      m.qtyAtA -= qIss;
    } else if (r.status >= 500) throw new Error(`5xx ${r.status} @ issue.execute ${id}: ${JSON.stringify(r.body).slice(0, 150)}`);
    else notes.push(`issue.execute PENDING→${r.status}`);
    assertInvariants(`issue.execute ${id} → ${r.status}`);
  }
  toString() { return "issue.execute"; }
}

class IssueCancelCmd implements fc.AsyncCommand<Model, unknown> {
  check(m: Model): boolean { return m.pendingIssues.length + m.completedIssues.length + m.deadIssues.length > 0; }
  async run(m: Model) {
    // Randomly probe all pools — dead issues must refuse cleanly (400-class, no movement).
    const pool = [...m.pendingIssues, ...m.completedIssues, ...m.deadIssues];
    const id = pick(pool)!;
    const wasPending = m.pendingIssues.includes(id);
    const wasCompleted = m.completedIssues.includes(id);
    const r = await api("PATCH", `/api/issue-materials/${id}`, { action: "cancel" });
    if (r.status === 200) {
      if (wasCompleted) {
        const qIss = Number(sql(`SELECT COALESCE(SUM(qty),0) FROM "MaterialIssueLine" WHERE "materialIssueId"='${q(id)}'`));
        m.qtyAtA += qIss;
      }
      m.pendingIssues = m.pendingIssues.filter((x) => x !== id);
      m.completedIssues = m.completedIssues.filter((x) => x !== id);
      m.deadIssues.push(id);
    } else if (r.status >= 500) throw new Error(`5xx ${r.status} @ issue.cancel ${id}: ${JSON.stringify(r.body).slice(0, 150)}`);
    else {
      // refused — must be a clean refusal AND the status must not have moved
      const st = sql(`SELECT status FROM "MaterialIssue" WHERE id='${q(id)}'`);
      const expect = wasPending ? "PENDING" : wasCompleted ? "COMPLETED" : "CANCELLED";
      if (st !== expect) throw new Error(`issue.cancel ${r.status} but status moved ${expect}→${st} (${id})`);
    }
    assertInvariants(`issue.cancel ${id} → ${r.status}`);
  }
  toString() { return "issue.cancel"; }
}

class TransferCreateCmd implements fc.AsyncCommand<Model, unknown> {
  constructor(readonly qty: number) {}
  check(): boolean { return true; }
  async run(m: Model) {
    bump("transfer.create");
    const r = await api("POST", "/api/transfers", {
      fromLocationId: LOC_A, toLocationId: LOC_B,
      lines: [{ materialId: MATERIAL, qty: this.qty }],
      notes: "opstream",
    });
    const b = r.body as Record<string, unknown>;
    const id = (b.id ?? b.transferId ?? (b.transfer as { id?: string })?.id) as string | undefined;
    if ((r.status === 200 || r.status === 201) && id) { probeIds.transfers.push(id); m.draftTransfers.push(id); }
    else if (r.status >= 500) throw new Error(`5xx ${r.status} @ transfer.create: ${JSON.stringify(r.body).slice(0, 150)}`);
    else notes.push(`transfer.create → ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`);
    assertInvariants(`transfer.create qty=${this.qty} → ${r.status}`);
  }
  toString() { return `transfer.create(${this.qty})`; }
}

class TransferActionCmd implements fc.AsyncCommand<Model, unknown> {
  constructor(readonly action: "dispatch" | "complete" | "cancel" | "returnToSource") {}
  check(m: Model): boolean {
    return m.draftTransfers.length + m.transitTransfers.length + m.deadTransfers.length > 0;
  }
  async run(m: Model) {
    const pool = [...m.draftTransfers, ...m.transitTransfers, ...m.deadTransfers];
    const id = pick(pool)!;
    const from = m.draftTransfers.includes(id) ? "DRAFT" : m.transitTransfers.includes(id) ? "IN_TRANSIT" : "DEAD";
    const r = await api("PATCH", `/api/transfers/${id}`, { action: this.action, vehicleNumber: "OPSTR-1", driverName: "op" });
    if (r.status === 200) {
      // Where did it land? Trust the DB over assumptions.
      const st = sql(`SELECT status FROM "StockTransfer" WHERE id='${q(id)}'`);
      if (from === "DRAFT") m.draftTransfers = m.draftTransfers.filter((x) => x !== id);
      else if (from === "IN_TRANSIT") m.transitTransfers = m.transitTransfers.filter((x) => x !== id);
      else m.deadTransfers = m.deadTransfers.filter((x) => x !== id);
      if (st === "IN_TRANSIT") m.transitTransfers.push(id);
      else if (st === "DRAFT") m.draftTransfers.push(id);
      else m.deadTransfers.push(id);
      if (from === "DEAD") notes.push(`transfer.${this.action} succeeded on ${st === "DEAD" ? "dead" : st} transfer ${id}`);
    } else if (r.status >= 500) throw new Error(`5xx ${r.status} @ transfer.${this.action} ${id}: ${JSON.stringify(r.body).slice(0, 150)}`);
    else {
      const st = sql(`SELECT status FROM "StockTransfer" WHERE id='${q(id)}'`);
      const expect = from === "DEAD" ? ["COMPLETED", "CANCELLED"] : [from];
      if (!expect.includes(st)) throw new Error(`transfer.${this.action} refused (${r.status}) but status moved ${from}→${st}`);
    }
    assertInvariants(`transfer.${this.action} ${id}(${from}) → ${r.status}`);
  }
  toString() { return `transfer.${this.action}`; }
}

const allCommands = [
  arbitraryQty.chain((qty) => fc.boolean().map((g) => new IssueCreateCmd(qty, g))),
  fc.constant(new IssueExecuteCmd()),
  fc.constant(new IssueCancelCmd()),
  arbitraryQty.map((qty) => new TransferCreateCmd(qty)),
  fc.constant(new TransferActionCmd("dispatch")),
  fc.constant(new TransferActionCmd("complete")),
  fc.constant(new TransferActionCmd("cancel")),
  fc.constant(new TransferActionCmd("returnToSource")),
];

// ── Runner ────────────────────────────────────────────────────────────────────
async function main() {
  if (!LOC_A || !LOC_B || !PROJECT) throw new Error("fixtures missing — need location+material+project in dev DB");
  await login();
  console.log(`op-stream @${BASE} locA=${LOC_A} locB=${LOC_B} mat=${MATERIAL} proj=${PROJECT}`);

  const seed = Number.isFinite(seedArg) ? seedArg : Date.now() % 2147483647;
  const numRuns = Number.isFinite(runsArg) ? runsArg : 25;
  const maxOps = Number.isFinite(opsArg) ? opsArg : 40;
  console.log(`seed=${seed} runs=${numRuns} ops/run≈${maxOps}`);

  await fc.assert(
    fc.asyncProperty(
      fc.commands(allCommands, { minLength: Math.floor(maxOps / 2), maxLength: maxOps }),
      async (cmds) => {
        const model: Model = {
          pendingIssues: [], completedIssues: [], deadIssues: [],
          draftTransfers: [], transitTransfers: [], deadTransfers: [],
          qtyAtA: 0,
        };
        await fc.asyncModelRun(() => ({ model, real: {} }), cmds);
      },
    ),
    { seed, numRuns, verbose: false },
  );
  console.log(`\n═══ PASS: ${numRuns} runs · ${probeIds.issues.length} issues · ${probeIds.transfers.length} transfers exercised`);
  console.log("── command counts:", JSON.stringify(cmdCounts));
  if (notes.length) {
    console.log("── notes (permissive-but-clean cells):");
    for (const n of [...new Set(notes)].slice(0, 20)) console.log("   " + n);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
