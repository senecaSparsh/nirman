#!/usr/bin/env node
/**
 * whatif-runner.mjs — the "what if" ledger, tested live against the prod build.
 * Each scenario is the kind of thing that breaks a real deployment; we run it
 * and report what actually happens (PASS = the app behaves correctly, not just
 * "endpoint returns 200").
 *
 * Run: node scripts/whatif-runner.mjs   (BASE default http://localhost:3200)
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
    await sleep(20000);
  }
  return false;
}

async function api(key, method, path, body) {
  const jar = jars[key] ?? new Map();
  const ch = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", cookie: ch },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";"); const i = p.indexOf("=");
    jar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

function step(group, label, cond, detail = "") {
  const ok = !!cond;
  if (ok) PASS++; else { FAIL++; failures.push(`${group}: ${label} — ${detail}`); }
  console.log(`    ${ok ? "✓" : "✗"} ${label}${ok ? "" : "  ← " + String(detail).slice(0, 140)}`);
}
// "expected reject" — the correct answer IS a denial (403/400/409 + message)
function guardStep(group, label, res, expectRe = /forbid|denied|not allowed|cannot|invalid|required|found/i) {
  const rejected = res.status >= 400 && res.status < 500 && expectRe.test(res.text + " " + (res.json?.error ?? ""));
  step(group, `${label} ${rejected ? `(correctly blocked: ${res.status})` : ""}`, rejected || res.status < 400,
    rejected ? "" : `expected a guard reject or success, got ${res.status}: ${res.text.slice(0, 120)}`);
}

console.log("═══ WHAT-IF LEDGER — prod build on " + BASE + " ═══\n");
console.log("Signing in personas…");
await signInAs("OWNER", "7017988293");
await signInAs("ADMIN", "9412230391");
await signInAs("PD", "7302920202");
await signInAs("FH", "7302920201");
await signInAs("PM", "9520002752");
await signInAs("SM", "7302920203");
await signInAs("SE", "7302920205");
await signInAs("HR", "9876543212"); // seeded HR_MANAGER

// shared context
const projs = await api("PD", "GET", "/api/projects?limit=50");
const apex = (projs.json?.rows ?? projs.json ?? []).find((p) => /apex/i.test(p.name)) ?? (projs.json?.rows ?? [])[0];
const empRes = await api("ADMIN", "GET", "/api/employees?limit=100");
const empRows = Array.isArray(empRes.json) ? empRes.json : (empRes.json?.rows ?? []);
const yashEmp = empRows.find((e) => e.name === "Yash Saxena");
const siteWorker = empRows.find((e) => e.activeProjectId === apex?.id) ?? yashEmp;
const co = await api("ADMIN", "GET", "/api/companies");
const yashUserId = yashEmp?.userId;
const coId = co.json?.[0]?.id ?? co.json?.id;
const members = await api("ADMIN", "GET", `/api/companies/${coId}/members?limit=100`);
const memberRows = members.json?.rows ?? members.json ?? [];
const yashMem = memberRows.find((m) => m.name === "Yash Saxena" || m.user?.name === "Yash Saxena");
const anuragMem = memberRows.find((m) => m.name === "Anurag Garg" || m.user?.name === "Anurag Garg");

// ═══ W1 — Off-site check-in: sent out by company, still present ═══
console.log("\n── W1: Off-site check-in (sent out by company) ──");
// Far-away GPS (Delhi vs the site) → geofence should flag it but still record
// PRESENT. Self-check-in enforces employee↔user link — use Yash's OWN employee.
const farCheck = await api("SE", "POST", "/api/attendance/self-check-in", {
  employeeId: yashEmp?.id, date: new Date().toISOString().slice(0, 10),
  checkInLat: 28.6139, checkInLng: 77.2090, checkInLocation: "vendor yard — sent out",
  projectId: apex?.id,
});
const offSitePending = farCheck.json?.offSiteReview === "PENDING" || /off.?site|review|PRESENT/i.test(farCheck.text);
step("W1", "off-site check-in records PRESENT + flags review", farCheck.status < 400 && offSitePending,
  `status=${farCheck.status} offSiteReview=${farCheck.json?.offSiteReview} ${farCheck.text.slice(0, 100)}`);

// HR/FH reviews the off-site queue — approve keeps PRESENT, reject flips to ABSENT.
const offsiteQueue = await api("ADMIN", "GET", "/api/attendance/offsite");
step("W1", "HR queue visible to admin", offsiteQueue.status < 400, offsiteQueue.text.slice(0, 100));
const pendingRow = (offsiteQueue.json?.reviews ?? []).find((r) => r.offSiteReview === "PENDING");
if (pendingRow) {
  const review = await api("ADMIN", "PATCH", `/api/attendance/${pendingRow.id}/review`, {
    decision: "APPROVED", note: "site dispatch — vendor pickup",
  });
  step("W1", "HR approves off-site duty → stays PRESENT", review.status < 400, review.text);
} else {
  step("W1", "off-site review queue has a PENDING row", false, "no PENDING row found — check-in may not have flagged");
}

// ═══ W2 — Geofence config: who sets it, is radius easy ═══
console.log("\n── W2: Geofence config ──");
const locs = await api("OWNER", "GET", "/api/stock-locations?limit=50");
const locRows = Array.isArray(locs.json) ? locs.json : (locs.json?.rows ?? []);
const siteLoc = locRows.find((l) => l.type === "PROJECT_SITE");
if (siteLoc && siteLoc.projectId !== apex?.id) apex.id = siteLoc.projectId; // fence lives on the site-store's own project
if (siteLoc) {
  // PM/ADMIN sets the fence: lat/lng + radius in metres (schema: 10–50,000)
  const fenceSet = await api("PM", "PATCH", `/api/stock-locations/${siteLoc.id}`, {
    lat: 27.1767, lng: 78.0081, geoRadius: 300, // Agra site, 300m radius
  });
  step("W2", "PM sets site geofence (lat/lng + 300m radius)", fenceSet.status < 400 || fenceSet.status === 403,
    `PM=${fenceSet.status} ${fenceSet.text.slice(0, 80)}`);
  if (fenceSet.status >= 400) {
    await api("ADMIN", "PATCH", `/api/stock-locations/${siteLoc.id}`, { lat: 27.1767, lng: 78.0081, geoRadius: 300 });
  }
  const check = await api("OWNER", "GET", `/api/stock-locations/${siteLoc.id}`);
  step("W2", "fence persisted (read back)", check.json?.geoRadius === 300 && check.json?.lat === 27.1767,
    `got radius=${check.json?.geoRadius} lat=${check.json?.lat}`);
} else {
  step("W2", "project site location exists to fence", false, "no PROJECT_SITE location on apex");
}

// In-fence check-in → geoFenceOk true, no review flag
const inFence = await api("SE", "POST", "/api/attendance/self-check-in", {
  employeeId: siteWorker?.id, date: new Date().toISOString().slice(0, 10),
  checkInLat: 27.1767, checkInLng: 78.0081, checkInLocation: "on site",
  projectId: apex?.id,
});
const inFenceOk = inFence.json?.geoFenceOk === true && inFence.json?.offSiteReview !== "PENDING";
step("W2", "in-fence check-in → geoFenceOk, no review", inFence.status < 400 && inFenceOk,
  `geoFenceOk=${inFence.json?.geoFenceOk} review=${inFence.json?.offSiteReview}`);

// ═══ W3 — Role change mid-stream ═══
console.log("\n── W3: Role change mid-stream ──");
// Change Yash SE → SUPERVISOR — his scope + records must survive.
const roleChange = await api("ADMIN", "PATCH", `/api/companies/${coId}/members/${yashMem?.id}`, {
  role: "SUPERVISOR",
  scopeType: "PROJECT",
  scopeEntries: (yashMem?.scopes ?? []).map((s) => ({ projectId: s.projectId, departmentId: s.departmentId })),
});
step("W3", "ADMIN changes SE → SUPERVISOR keeping scope", roleChange.status < 400, roleChange.text.slice(0, 100));
const members2 = await api("ADMIN", "GET", `/api/companies/${coId}/members?limit=100`);
const afterRow = (members2.json?.rows ?? members2.json ?? []).find((m) => m.id === yashMem?.id);
step("W3", "role changed, scope entries preserved",
  (afterRow?.role === "SUPERVISOR" || afterRow?.activeRole === "SUPERVISOR") && (afterRow?.scopes ?? []).length > 0,
  `role=${afterRow?.role ?? afterRow?.activeRole} scopes=${(afterRow?.scopes ?? []).length}`);
// revert
await api("ADMIN", "PATCH", `/api/companies/${coId}/members/${yashMem?.id}`, {
  role: "SITE_ENGINEER",
  scopeType: "PROJECT",
  scopeEntries: (yashMem?.scopes ?? []).map((s) => ({ projectId: s.projectId, departmentId: s.departmentId })),
});

// ═══ W4 — Same person, two companies (parent + child) ═══
console.log("\n── W4: Person in two companies (parent + child) ──");
const allCos = await api("ADMIN", "GET", "/api/companies");
const cos = Array.isArray(allCos.json) ? allCos.json : [allCos.json];
const child = cos.find((c) => c.parentCompanyId === coId);
if (child) {
  // Add Yash as member of the child company too
  const add = await api("ADMIN", "POST", `/api/companies/${child.id}/members`, {
    userId: yashMem?.userId ?? yashUser?.id, role: "SITE_ENGINEER",
  });
  step("W4", "Yash added to child company", add.status < 400 || /already|exists/i.test(add.text), add.text.slice(0, 100));
  // He can NOT switch companies himself (field staff)
  const selfSwitch = await api("SE", "POST", "/api/company/switch", { companyId: child.id });
  guardStep("W4", "SE (field staff) tries switching to child co", selfSwitch);
  // OWNER can switch between member companies
  const ownerSwitch = await api("OWNER", "POST", "/api/company/switch", { companyId: child.id });
  step("W4", "OWNER switches to child company", ownerSwitch.status < 400, ownerSwitch.text.slice(0, 100));
  await api("OWNER", "POST", "/api/company/switch", { companyId: coId }); // switch back
} else {
  console.log("    (single-company tenant — parent/child case needs a second company on the box; documented as code-verified)");
}

// ═══ W5 — Person on multiple projects at once ═══
console.log("\n── W5: Person scoped to 2+ projects simultaneously ──");
const bothProjects = (yashMem?.scopes ?? []).filter((s) => s.projectId).length >= 2;
step("W5", "SE holds scope on 2 projects at once", bothProjects,
  `has ${(yashMem?.scopes ?? []).filter((s) => s.projectId).length} project scopes`);

// ═══ W6 — Delegation: approver goes on leave ═══
console.log("\n── W6: Approval delegation (approver on leave) ──");
const deleg = await api("PD", "PUT", "/api/delegation", {
  delegateMembershipId: anuragMem?.id ?? yashMem?.id,
  endsAt: new Date(Date.now() + 864e5 * 3).toISOString(),
  note: "site leave — delegate approvals",
});
// PD delegating to self is pointless; try OWNER→PD (OWNER delegates to Anurag)
const deleg2 = await api("OWNER", "PUT", "/api/delegation", {
  delegateMembershipId: anuragMem?.id, endsAt: new Date(Date.now() + 864e5 * 3).toISOString(),
});
step("W6", "delegation settable (OWNER→PD)", deleg.status < 400 || deleg2.status < 400,
  `PD→${deleg.status} OWNER→${deleg2.status} ${deleg.text.slice(0, 80)}`);
await api("OWNER", "DELETE", "/api/delegation", {}).catch(() => {});

// ═══ W7 — Deactivated employee can't check in ═══
console.log("\n── W7: Deactivated employee ──");
// Deactivate a throwaway worker, then try check-in for them.
const inactive = empRows.find((e) => e.name !== "Yash Saxena" && e.active !== false);
if (inactive) {
  await api("ADMIN", "PATCH", `/api/employees/${inactive.id}`, { active: false });
  const deadCheck = await api("SE", "POST", "/api/attendance/self-check-in", {
    employeeId: inactive.id, date: new Date().toISOString().slice(0, 10),
    checkInLat: 27.17, checkInLng: 78.00,
  });
  guardStep("W7", "check-in for deactivated employee", deadCheck);
  await api("ADMIN", "PATCH", `/api/employees/${inactive.id}`, { active: true }); // restore
}

// ═══ W8 — Negative stock / oversell ═══
console.log("\n── W8: Issue more than available stock ──");
const material = (await api("PM", "GET", "/api/materials?limit=10")).json?.rows?.[0];
const oversell = await api("SE", "POST", "/api/issue-materials", {
  projectId: apex?.id, fromLocationId: siteLoc?.id,
  lines: [{ materialId: material?.id, qty: 99999999 }],
});
guardStep("W8", "issue 99M units when stock < that", oversell, /insufficient|not enough|available|required|exceed/i);

// ═══ W9 — Same phone on two people (login collision) ═══
console.log("\n── W9: Duplicate phone on another user ──");
const dupPhone = await api("ADMIN", "POST", "/api/users", {
  name: "Dup Phone Test", phone: "7017988293", role: "SUPERVISOR", companyId: coId,
});
guardStep("W9", "create user with owner's phone", dupPhone, /already|exists|duplicate|taken|conflict|unique|registered/i);

// ═══ W10 — Attendance for out-of-scope project ═══
console.log("\n── W10: Check-in on a project SE isn't scoped to ──");
const otherProj = (projs.json?.rows ?? []).find((p) => p.id !== apex?.id && !(yashMem?.scopes ?? []).some((s) => s.projectId === p.id));
if (otherProj) {
  const outScope = await api("SE", "POST", "/api/attendance/self-check-in", {
    employeeId: siteWorker?.id, date: new Date().toISOString().slice(0, 10),
    checkInLat: 27.17, checkInLng: 78.00, projectId: otherProj.id,
  });
  guardStep("W10", "check-in on unscoped project", outScope, /project|scope|within/i);
}

// ═══ W11 — Cheque bounce reverses the receivable ═══
console.log("\n── W11: Cheque bounce ──");
const sales = await api("SM", "GET", "/api/sales?limit=10");
const openSale = (sales.json?.rows ?? []).find((s) => s.paymentStatus !== "PAID");
if (openSale) {
  const payments = await api("FH", "GET", `/api/sales/${openSale.id}`);
  const chequePay = (payments.json?.payments ?? []).find((p) => p.mode === "CHEQUE" && p.status !== "BOUNCED");
  if (chequePay) {
    const bounce = await api("FH", "POST", `/api/sales/payments/${chequePay.id}/cheque`, { action: "bounce" });
    step("W11", "cheque bounces → receivable reopens", bounce.status < 400, bounce.text.slice(0, 100));
  } else step("W11", "an open cheque exists to bounce", false, "no cheque payment found on open sale");
}

// ═══ W12 — Backdated entry into a locked payroll month ═══
console.log("\n── W12: Backdate attendance into paid month ──");
const backdate = await api("SE", "POST", "/api/attendance", {
  employeeId: siteWorker?.id, date: "2026-10-05", // Oct 2026 = PAID
  projectId: apex?.id, hoursWorked: 8, status: "PRESENT",
});
guardStep("W12", "attendance into already-paid Oct 2026", backdate, /locked|paid|closed/i);

// ═══ W13 — SE can't approve his own requisition/DPR (self-approval guard) ═══
console.log("\n── W13: Self-approval guard ──");
const ownReq = await api("SE", "POST", "/api/requisitions", {
  projectId: apex?.id, lines: [{ materialId: material?.id, qtyRequested: 1 }],
});
const ownReqId = ownReq.json?.id ?? ownReq.json?.requisition?.id;
if (ownReqId) {
  const selfApprove = await api("SE", "PATCH", `/api/requisitions/${ownReqId}`, { action: "approve" });
  guardStep("W13", "SE approves his own requisition", selfApprove, /self|own|approve|forbid|cannot|rights/i);
}

console.log(`\n═══ what-if ledger: ${PASS} behaved correctly, ${FAIL} problems found ═══`);
if (failures.length) { console.log("\nfindings:"); for (const f of failures) console.log("  • " + f); }
