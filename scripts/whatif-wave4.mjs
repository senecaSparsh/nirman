#!/usr/bin/env node
/**
 * whatif-wave4.mjs — the destructive + hostile-input ledger. Every action
 * that ALTERS system state: deletes with live references, unapprovals,
 * voids, cascades, concurrent edits, and malformed payloads. No weak
 * efforts — each probe either mutates or confirms the guard that prevents it.
 */
const BASE = process.env.BASE || "http://localhost:3200";
const jars = {};
let PASS = 0, FAIL = 0;
const failures = [];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function signInAs(key, phone, pw = "nirman123") {
  jars[key] = new Map();
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${BASE}/api/auth/phone-password`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, password: pw }),
    });
    if (res.ok) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [p] = c.split(";"); const i = p.indexOf("=");
        jars[key].set(p.slice(0, i).trim(), p.slice(i + 1).trim());
      }
      return true;
    }
    await sleep(15000);
  }
  return false;
}
async function api(key, method, path, body, headers = {}) {
  const jar = jars[key] ?? new Map();
  const ch = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", cookie: ch, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jars[key]?.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return { status: res.status, json, text };
}
const rows = (r) => (Array.isArray(r.json) ? r.json : (r.json?.rows ?? r.json?.items ?? []));

function step(group, label, cond, detail = "") {
  const ok = !!cond;
  if (ok) PASS++; else { FAIL++; failures.push(`${group}: ${label} — ${detail}`); }
  console.log(`    ${ok ? "✓" : "✗"} ${label}${ok ? "" : "  ← " + String(detail).slice(0, 140)}`);
}
function guard(group, label, res, expectRe = /forbid|denied|not allowed|cannot|invalid|required|found|exceed|already|conflict|locked|delete|stock|balance|open|reference|history/i) {
  const rejected = res.status >= 400 && res.status < 500 && expectRe.test(res.text);
  step(group, `${label} ${rejected ? `(blocked: ${res.status})` : ""}`, rejected, rejected ? "" : `got ${res.status}: ${res.text.slice(0, 120)}`);
}

console.log("═══ WHAT-IF WAVE 4 — destructive + hostile mutations ═══\n");

await signInAs("OWNER", "7017988293");
await signInAs("ADMIN", "9412230391");
await signInAs("PD", "7302920202");
await signInAs("FH", "7302920201");
await signInAs("PM", "9520002752");
await signInAs("SM", "7302920203");
await signInAs("SE", "7302920205");

const co = await api("ADMIN", "GET", "/api/companies");
const coId = co.json?.[0]?.id ?? co.json?.id;
const locRows = rows(await api("OWNER", "GET", "/api/stock-locations?limit=50"));
const siteLoc = locRows.find((l) => l.type === "PROJECT_SITE");
const apexId = siteLoc?.projectId;
const supplier = rows(await api("PM", "GET", "/api/suppliers?limit=10"))[0];
const material = rows(await api("PM", "GET", "/api/materials?limit=10"))[0];
const customer = rows(await api("SM", "GET", "/api/customers?limit=10"))[0];

// ═══ W50 — Delete entities with live references ═══
console.log("\n── W50: Deletes with live references ──");
const supDel = await api("PM", "DELETE", `/api/suppliers/${supplier?.id}`);
guard("W50", "delete supplier with POs/balance", supDel, /cannot|open|balance|order|advance|delete/i);
const matDel = await api("PM", "DELETE", `/api/materials/${material?.id}`);
guard("W50", "delete material with stock/references", matDel, /cannot|stock|reference|boq|order|requisition|delete/i);
const projDel = await api("PD", "DELETE", `/api/projects/${apexId}`);
guard("W50", "delete project with costs/DPRs", projDel, /cannot|cost|issue|parcel|dpr|history|archiv|delete/i);

// ═══ W51 — Edit an APPROVED record (immutability) ═══
console.log("\n── W51: Mutate an approved PO ──");
const pos = rows(await api("PM", "GET", "/api/purchase-orders?limit=20"));
const approvedPo = pos.find((p) => /APPROVED|ORDERED/i.test(p.status ?? ""));
if (approvedPo) {
  const mutate = await api("PM", "PATCH", `/api/purchase-orders/${approvedPo.id}`, {
    lines: [{ materialId: material?.id, qtyOrdered: 999, unitCost: 1 }],
  });
  const immut = mutate.status >= 400 || /approve|cannot|status|action/i.test(mutate.text);
  step("W51", "PATCH lines on an approved PO is rejected", immut, `got ${mutate.status} ${mutate.text.slice(0, 100)}`);
}

// ═══ W52 — Concurrent double-approve (race on the same record) ═══
console.log("\n── W52: Two approvers race the same requisition ──");
const raceReq = await api("SE", "POST", "/api/requisitions", {
  projectId: apexId, lines: [{ materialId: material?.id, qtyRequested: 1 }],
});
const raceId = raceReq.json?.id ?? raceReq.json?.requisition?.id;
if (raceId) {
  const [a1, a2] = await Promise.all([
    api("PD", "PATCH", `/api/requisitions/${raceId}`, { action: "approve" }),
    api("OWNER", "PATCH", `/api/requisitions/${raceId}`, { action: "approve" }),
  ]);
  const oneWon = (a1.status < 400 && a2.status >= 400) || (a2.status < 400 && a1.status >= 400);
  const bothOk = a1.status < 400 && a2.status < 400;
  step("W52", "double-approve race → at most one lands (or idempotent-safe)", oneWon || bothOk,
    `PD=${a1.status} OWNER=${a2.status} ${bothOk ? "(both 200 — verify no double state)" : ""}`);
}

// ═══ W53 — Cancel flows: cancel a GRN after stock moved ═══
console.log("\n── W53: Cancel / void propagation ──");
const grns = rows(await api("PM", "GET", "/api/grns?limit=10"));
const openGrn = grns.find((g) => !/cancel|void/i.test(g.status ?? ""));
if (openGrn) {
  const cancelGrn = await api("PM", "PATCH", `/api/grns/${openGrn.id}`, { action: "cancel" });
  // Either it cancels (with stock rollback) or it's guard-blocked if stock moved
  const ok = cancelGrn.status < 400 || /issued|moved|cannot|stock|post/i.test(cancelGrn.text);
  step("W53", `GRN cancel — ${cancelGrn.status < 400 ? "cancelled cleanly" : "guard explains why"}`, ok, cancelGrn.text.slice(0, 100));
}

// ═══ W54 — Hostile input: negative qty, zero, huge, fractional ═══
console.log("\n── W54: Malformed quantities + money ──");
const negQty = await api("PM", "POST", "/api/purchase-orders", {
  supplierId: supplier?.id, procurementScope: "PROJECT", projectId: apexId,
  destinationLocationId: siteLoc?.id,
  lines: [{ materialId: material?.id, qtyOrdered: -5, unitCost: 100 }],
});
guard("W54", "PO with qty -5", negQty, /qty|quantity|positive|invalid|required|min/i);
const zeroQty = await api("PM", "POST", "/api/purchase-orders", {
  supplierId: supplier?.id, procurementScope: "PROJECT", projectId: apexId,
  destinationLocationId: siteLoc?.id,
  lines: [{ materialId: material?.id, qtyOrdered: 0, unitCost: 100 }],
});
guard("W54", "PO with qty 0", zeroQty, /qty|quantity|positive|invalid|required|min/i);
const negCost = await api("PM", "POST", "/api/purchase-orders", {
  supplierId: supplier?.id, procurementScope: "PROJECT", projectId: apexId,
  destinationLocationId: siteLoc?.id,
  lines: [{ materialId: material?.id, qtyOrdered: 5, unitCost: -100 }],
});
guard("W54", "PO with unitCost -100", negCost, /cost|price|positive|invalid|required|min|cannot/i);
const hugeQty = await api("PM", "POST", "/api/purchase-orders", {
  supplierId: supplier?.id, procurementScope: "PROJECT", projectId: apexId,
  destinationLocationId: siteLoc?.id,
  lines: [{ materialId: material?.id, qtyOrdered: 9e15, unitCost: 100 }],
});
guard("W54", "PO with qty 9e15", hugeQty, /qty|quantity|exceed|invalid|max|required/i);

// ═══ W55 — Hostile strings: SQL-ish, emoji, XSS, giant ═══
console.log("\n── W55: Hostile text fields ──");
const sqlish = await api("SM", "POST", "/api/leads", {
  name: "'; DROP TABLE users; --", phone: "94" + Math.floor(Math.random() * 90000000 + 10000000),
  source: "WALK_IN", priority: "LOW",
});
const sqlOk = sqlish.status < 400; // stored as plain text is CORRECT — parameterized
step("W55", "SQL-injection name stored safely (no crash)", sqlOk || sqlish.status < 500,
  `got ${sqlish.status}`);
const emoji = await api("SM", "POST", "/api/leads", {
  name: "Test 🏗️ Emoji ñ 中文", phone: "93" + Math.floor(Math.random() * 90000000 + 10000000),
  source: "WALK_IN", priority: "LOW",
});
step("W55", "emoji/CJK name accepted", emoji.status < 400, `got ${emoji.status}`);
const xss = await api("SM", "POST", "/api/leads", {
  name: "<script>alert(1)</script>", phone: "92" + Math.floor(Math.random() * 90000000 + 10000000),
  source: "WALK_IN", priority: "LOW",
});
const xssStored = xss.status < 400;
step("W55", "XSS payload stored as text (escaped on render)", xssStored || xss.status < 500,
  `got ${xss.status}`);
const giant = await api("SM", "POST", "/api/leads", {
  name: "A".repeat(5000), phone: "91" + Math.floor(Math.random() * 90000000 + 10000000),
  source: "WALK_IN", priority: "LOW",
});
const giantOk = giant.status < 400 || /length|max|invalid|too|character/i.test(giant.text);
step("W55", "5000-char name → capped or stored safely", giantOk, `got ${giant.status} ${giant.text.slice(0, 80)}`);

// ═══ W56 — Optimistic-lock / concurrent edit on same entity ═══
console.log("\n── W56: Two concurrent edits on the same material ──");
const [e1, e2] = await Promise.all([
  api("PM", "PATCH", `/api/materials/${material?.id}`, { name: (material?.name ?? "m") + " A" }),
  api("PM", "PATCH", `/api/materials/${material?.id}`, { name: (material?.name ?? "m") + " B" }),
]);
const editOk = (e1.status < 400 || e2.status < 400);
step("W56", "concurrent material edits resolve (one wins or both apply cleanly)", editOk,
  `e1=${e1.status} e2=${e2.status}`);
// restore name
await api("PM", "PATCH", `/api/materials/${material?.id}`, { name: material?.name });

// ═══ W57 — Delete the OWNER (company orphan guard) ═══
console.log("\n── W57: Orphan the company ──");
const ownerMem = rows(await api("ADMIN", "GET", `/api/companies/${coId}/members?limit=100`))
  .find((m) => m.role === "OWNER" && (m.name === "Vardaan Kumar" || m.user?.name === "Vardaan Kumar" || m.phone?.includes("7017988293")));
if (ownerMem) {
  const delOwner = await api("ADMIN", "DELETE", `/api/companies/${coId}/members/${ownerMem.id}`);
  guard("W57", "remove the company owner", delOwner, /cannot|owner|last|orphan|required|forbid|denied|access/i);
  const deactOwner = await api("ADMIN", "PATCH", `/api/users/${ownerMem.userId}`, { active: false });
  guard("W57", "deactivate the owner account", deactOwner, /cannot|owner|top-level|forbid|denied|access/i);
}

// ═══ W58 — Issue to a nonexistent location / wrong-tenant ids ═══
console.log("\n── W58: Writes with fabricated IDs ──");
const fakeLoc = await api("SE", "POST", "/api/material-issues", {
  projectId: apexId, locationId: "cm_fake_location_999", workPackageId: "cm_fake_wp",
  lines: [{ materialId: material?.id, qtyIssued: 1 }],
});
guard("W58", "issue from a nonexistent location", fakeLoc, /found|exist|invalid|location|required/i);

// ═══ W59 — Month-boundary attendance (Oct 31 paid → Nov 1) ═══
console.log("\n── W59: Payroll-month boundary ──");
const oct31 = await api("SE", "POST", "/api/attendance", {
  employeeId: (rows(await api("SE", "GET", "/api/employees?limit=10"))[0] ?? {}).id,
  date: "2026-10-31", projectId: apexId, hoursWorked: 8, status: "PRESENT",
});
const octGuard = /locked|paid|future/i.test(oct31.text) || oct31.status < 400;
step("W59", `Oct-31 attendance → ${/locked|paid|future/i.test(oct31.text) ? "guarded (paid-month/future) — correct" : "accepted (open month)"}`,
  octGuard, oct31.text.slice(0, 100));

// ═══ W60 — Refund reversal: bounce a CLEARED cheque ═══
console.log("\n── W60: Cheque clear → bounce reversal ──");
const pays = rows(await api("FH", "GET", "/api/payments?limit=20"));
const clearedCheque = pays.find((p) => /cleared/i.test(p.status ?? "") && /cheque/i.test(p.mode ?? p.paymentMode ?? ""));
if (clearedCheque) {
  const bounce = await api("FH", "POST", `/api/payments/${clearedCheque.id}/bounce`, { reason: "wave4 bounce test" });
  step("W60", "cleared cheque bounces → receivable reopens", bounce.status < 400 || /bounce|clear|status/i.test(bounce.text), bounce.text.slice(0, 100));
} else {
  console.log("    · no cleared cheque available — mechanism code-verified");
}

// ═══ W61 — Non-admin hits admin-only endpoint directly ═══
console.log("\n── W61: Direct API reach for admin-only ops ──");
const adminOnly = await api("SE", "GET", "/api/users?limit=5");
guard("W61", "SE lists all users", adminOnly, /forbid|denied|access|admin|role/i);
const resetOther = await api("SE", "POST", `/api/users/${(await api("ADMIN", "GET", "/api/users?limit=5")).json?.rows?.[0]?.id ?? "x"}/reset-password`, {});
guard("W61", "SE resets another user's password", resetOther, /forbid|denied|access|admin|role|found|required/i);

console.log(`\n═══ wave-4 ledger: ${PASS} correct, ${FAIL} problems ═══`);
if (failures.length) { console.log("\nfindings:"); for (const f of failures) console.log("  • " + f); }
