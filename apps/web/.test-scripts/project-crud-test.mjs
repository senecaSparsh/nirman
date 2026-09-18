/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Project CRUD sanity (as OWNER + scoped SITE_ENGINEER):
//   create → site-store side effect → patch → delete → cross-tenant.
// ─────────────────────────────────────────────────────────────────────
import { prisma } from "@nirman/db";

const BASE = "http://localhost:3000";
const OTHER = "cmtxajzqh0000vl2sskqywa6b";
const PW = "nirman123";

const results = [];
function rec(name, expect, actual, verdict) {
  results.push({ name, verdict });
  console.log(`${verdict === "PASS" ? "✅" : verdict === "WARN" ? "⚠️ " : "❌"} ${name}\n     expect: ${expect}\n     actual: ${actual}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(cookie, method, path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "Origin": BASE, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 2) {
      const ra = Number(res.headers.get("retry-after") ?? 3);
      await sleep(Math.max(1500, ra * 1000));
      continue;
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
}

async function signIn(email, password) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ email, password }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const session = cookies.map((c) => c.split(";")[0]).filter((c) => c.includes("session")).join("; ");
  return { cookie: session || null };
}

async function demoLogin(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

const foreignProj = await prisma.project.findFirst({ where: { companyId: OTHER, deletedAt: null }, select: { id: true, name: true } });
const owner = await demoLogin("OWNER");
const oc = (await signIn(owner.email, owner.password)).cookie;
const rc = (await signIn("rohan.testemp@nirman.internal", PW)).cookie;
console.log("owner:", !!oc, "| rohan:", !!rc);

let projId = null;
console.log("\n═══ A. Create + side effects ═══");
{
  const create = await api(oc, "POST", "/api/projects", { name: "E2E Test Project", type: "RESIDENTIAL" });
  projId = create.data?.id;
  const store = projId ? await prisma.stockLocation.findFirst({ where: { projectId: projId, type: "PROJECT_SITE" } }) : null;
  rec("A1 create project → site store auto-created",
    "201 + PROJECT_SITE store exists",
    `${create.status} store=${store?.name ?? "none"}`,
    create.status === 201 && !!store ? "PASS" : "FAIL");

  const noName = await api(oc, "POST", "/api/projects", { type: "RESIDENTIAL" });
  rec("A2 missing name → 400", "400", `${noName.status} ${noName.data?.error ?? ""}`, noName.status === 400 ? "PASS" : "FAIL");

  const list = await api(oc, "GET", "/api/projects");
  const found = Array.isArray(list.data) && list.data.some((p) => p.id === projId);
  rec("A3 new project in GET list", "found", `status=${list.status} found=${found}`, found ? "PASS" : "FAIL");

  const rohanList = await api(rc, "GET", "/api/projects");
  const rohanSees = Array.isArray(rohanList.data) && rohanList.data.some((p) => p.id === projId);
  rec("A4 PROJECT-scoped rohan does NOT see unassigned project",
    "absent from his list",
    `rohan list has it=${rohanSees} (he sees ${rohanList.data?.length ?? 0} total)`,
    !rohanSees ? "PASS" : "FAIL");
}

console.log("\n═══ B. Read + patch ═══");
{
  const get = await api(oc, "GET", `/api/projects/${projId}`);
  rec("B1 GET project", "200", `${get.status} name=${get.data?.name}`, get.status === 200 ? "PASS" : "FAIL");

  const rohanGet = await api(rc, "GET", `/api/projects/${projId}`);
  rec("B2 rohan GET unassigned project", "404 scope-blocked", `${rohanGet.status}`, rohanGet.status === 404 ? "PASS" : "FAIL");

  const patch = await api(oc, "PATCH", `/api/projects/${projId}`, { name: "E2E Test Project Renamed", type: "RESIDENTIAL" });
  const after = await prisma.project.findUnique({ where: { id: projId }, select: { name: true } });
  rec("B3 PATCH rename", "200 + persisted", `${patch.status} name=${after?.name}`, patch.status === 200 && after?.name === "E2E Test Project Renamed" ? "PASS" : "FAIL");

  const rohanPatch = await api(rc, "PATCH", `/api/projects/${projId}`, { name: "Hacked" });
  const afterRohan = await prisma.project.findUnique({ where: { id: projId }, select: { name: true } });
  rec("B4 rohan PATCH project (no projects.manage)", "403 + unchanged", `${rohanPatch.status} name=${afterRohan?.name}`, rohanPatch.status !== 200 && afterRohan?.name !== "Hacked" ? "PASS" : "FAIL");

  const foreign = await api(oc, "GET", `/api/projects/${foreignProj.id}`);
  rec("B5 GET foreign company project", "404", `${foreign.status}`, foreign.status === 404 ? "PASS" : "FAIL");

  const foreignPatch = await api(oc, "PATCH", `/api/projects/${foreignProj.id}`, { name: "Hacked", type: "RESIDENTIAL" });
  const fAfter = await prisma.project.findUnique({ where: { id: foreignProj.id }, select: { name: true } });
  rec("B6 PATCH foreign project", "404 + untouched", `${foreignPatch.status} name=${fAfter?.name}`, foreignPatch.status === 404 && fAfter?.name === foreignProj.name ? "PASS" : "FAIL");
}

console.log("\n═══ C. Delete ═══");
{
  const del = await api(oc, "DELETE", `/api/projects/${projId}`);
  const after = await prisma.project.findUnique({ where: { id: projId }, select: { deletedAt: true } });
  rec("C1 owner deletes → soft-deleted", "200 + deletedAt", `${del.status} deletedAt=${!!after?.deletedAt}`, del.status === 200 && !!after?.deletedAt ? "PASS" : "FAIL");

  const get = await api(oc, "GET", `/api/projects/${projId}`);
  rec("C2 GET deleted project → 404", "404", `${get.status}`, get.status === 404 ? "PASS" : "FAIL");

  const foreignDel = await api(oc, "DELETE", `/api/projects/${foreignProj.id}`);
  const fAfter = await prisma.project.findUnique({ where: { id: foreignProj.id }, select: { deletedAt: true } });
  rec("C3 DELETE foreign project → 404 untouched", "404 + deletedAt null", `${foreignDel.status} deletedAt=${fAfter?.deletedAt}`, foreignDel.status === 404 && !fAfter?.deletedAt ? "PASS" : "FAIL");

  const missing = await api(oc, "DELETE", "/api/projects/no-such-id");
  rec("C4 DELETE nonexistent", "404", `${missing.status}`, missing.status === 404 ? "PASS" : "FAIL");
}

const fails = results.filter((r) => r.verdict === "FAIL");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL ════════════════`);
for (const r of fails) console.log(`  ❌ ${r.name}`);
await prisma.$disconnect();
