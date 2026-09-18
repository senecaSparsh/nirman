/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Company members flow test (as OWNER): add/patch/remove members,
// garbage-role probes, cross-tenant member-id reads, self/last-owner
// removal guards.
// ─────────────────────────────────────────────────────────────────────
import { prisma } from "@nirman/db";

const BASE = "http://localhost:3000";
const SRG = "cmu1990sa0000vlpqpegbainb";
const OTHER = "cmtxajzqh0000vl2sskqywa6b";
const PW = "nirman123";

const results = [];
function rec(name, expect, actual, verdict, detail = "") {
  results.push({ name, expect, actual, verdict, detail });
  const icon = verdict === "PASS" ? "✅" : verdict === "WARN" ? "⚠️ " : "❌";
  console.log(`${icon} ${name}\n     expect: ${expect}\n     actual: ${actual}${detail ? `\n     ${detail}` : ""}`);
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
  if (!session) return { cookie: null, status: res.status };
  return { cookie: session, status: res.status };
}

async function demoLogin(role) {
  const res = await fetch(`${BASE}/api/auth/demo-login`, {
    method: "POST", headers: { "Content-Type": "application/json", "Origin": BASE },
    body: JSON.stringify({ role }),
  });
  return res.json();
}

const rohanUserId = "cmu71ujzx0005vleq9qjtot5p";
const hemaUserId = "cmu71uk28000dvleqc4w8p270";
const vardaanUserId = "cmu1990sf0002vlpqw5kcsgpa"; // OWNER
const rohanMem = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: rohanUserId, companyId: SRG } } });
const hemaMem = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: hemaUserId, companyId: SRG } } });
const ownerMem = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: vardaanUserId, companyId: SRG } } });
const foreignMem = await prisma.userCompany.findFirst({ where: { companyId: OTHER }, include: { user: { select: { name: true } } } });
const TEST_EMAIL = "member.test@nirman.internal";

console.log("=== signing in ===");
const owner = await demoLogin("OWNER");
const oc = (await signIn(owner.email, owner.password)).cookie;
const rc = (await signIn("rohan.testemp@nirman.internal", PW)).cookie;
console.log("owner:", !!oc, "| rohan:", !!rc);
if (!oc || !rc) { console.log("FATAL: sign-in failed"); process.exit(1); }

const members = (c, method, body) => api(c, method, `/api/companies/${SRG}/members`, body);
const member = (c, method, memId, body, qs = "") => api(c, method, `/api/companies/${SRG}/members/${memId}${qs}`, body);
const memberForeignCo = (c, method, memId, body, qs = "") => api(c, method, `/api/companies/${OTHER}/members/${memId}${qs}`, body);

// Cleanup any leftover test member from a previous run
{
  const stale = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (stale) {
    await prisma.userCompany.deleteMany({ where: { userId: stale.id } });
    await prisma.user.delete({ where: { id: stale.id } });
    console.log("(cleaned stale test member)");
  }
}

console.log("\n═══ A. POST /api/companies/[id]/members ═══");
{
  const badEmail = await members(oc, "POST", { email: "not-an-email", role: "SUPERVISOR" });
  rec("A1 invalid email", "400", `${badEmail.status} ${badEmail.data?.error ?? ""}`, badEmail.status === 400 ? "PASS" : "FAIL");

  const garbage = await members(oc, "POST", { email: TEST_EMAIL, role: "GARBAGE_ROLE_XYZ" });
  const gUser = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  const gRole = gUser ? (await prisma.userCompany.findFirst({ where: { userId: gUser.id, companyId: SRG } }))?.role : null;
  rec("A2 garbage role string",
    "400 — not silently stored as SUPERVISOR",
    `${garbage.status} ${garbage.data?.error ?? ""} | stored role=${gRole}`,
    garbage.status === 400 && gRole === null ? "PASS" : "FAIL");

  const badCustom = await members(oc, "POST", { email: TEST_EMAIL, role: "CUSTOM_NONEXISTENT" });
  rec("A3 nonexistent custom role",
    "400",
    `${badCustom.status} ${badCustom.data?.error ?? ""}`,
    badCustom.status === 400 ? "PASS" : "FAIL");

  const ok = await members(oc, "POST", { email: TEST_EMAIL, role: "SUPERVISOR" });
  const tUser = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  const tMem = tUser ? await prisma.userCompany.findFirst({ where: { userId: tUser.id, companyId: SRG } }) : null;
  rec("A4 add new member as SUPERVISOR",
    "201 + user + membership created",
    `${ok.status} userExists=${!!tUser} memRole=${tMem?.role}`,
    ok.status === 201 && tMem?.role === "SUPERVISOR" ? "PASS" : "FAIL");

  const again = await members(oc, "POST", { email: TEST_EMAIL, role: "STORE_KEEPER" });
  const tMem2 = await prisma.userCompany.findFirst({ where: { userId: tUser.id, companyId: SRG } });
  rec("A5 re-POST same email → role updated (idempotent upsert)",
    "201 + role=STORE_KEEPER",
    `${again.status} memRole=${tMem2?.role}`,
    again.status === 201 && tMem2?.role === "STORE_KEEPER" ? "PASS" : "WARN");

  const list = await members(oc, "GET");
  const inList = Array.isArray(list.data) && list.data.some((m) => m.userId === tUser.id);
  rec("A6 member appears in GET members list",
    "in list with STORE_KEEPER",
    `status=${list.status} found=${inList}`,
    list.status === 200 && inList ? "PASS" : "FAIL");

  const noPerm = await members(rc, "POST", { email: "x@y.z", role: "SUPERVISOR" });
  rec("A7 rohan (no company.manage) POST member",
    "403",
    `${noPerm.status} ${noPerm.data?.error ?? ""}`,
    noPerm.status === 403 ? "PASS" : "FAIL");
}

console.log("\n═══ B. PATCH member role ═══");
{
  const p = await member(oc, "PATCH", rohanMem.id, { role: "STORE_KEEPER" });
  rec("B1 owner changes rohan membership role",
    "200 + role stored",
    `${p.status} role=${p.data?.role ?? (await prisma.userCompany.findUnique({ where: { id: rohanMem.id } }))?.role}`,
    p.status === 200 ? "PASS" : "FAIL");
  await member(oc, "PATCH", rohanMem.id, { role: "SITE_ENGINEER" }); // restore

  const garbage = await member(oc, "PATCH", rohanMem.id, { role: "GARBAGE_ROLE_XYZ" });
  const after = await prisma.userCompany.findUnique({ where: { id: rohanMem.id } });
  rec("B2 garbage role on PATCH",
    "400 — role unchanged",
    `${garbage.status} ${garbage.data?.error ?? ""} | stored=${after?.role}`,
    garbage.status === 400 && after?.role === "SITE_ENGINEER" ? "PASS" : "FAIL");

  const foreign = await member(oc, "PATCH", foreignMem.id, { role: "SUPERVISOR" });
  const fAfter = await prisma.userCompany.findUnique({ where: { id: foreignMem.id } });
  rec("B3 PATCH another company's membership via our company URL",
    "404, foreign role untouched",
    `${foreign.status} | foreign role=${fAfter?.role}`,
    foreign.status === 404 ? "PASS" : "FAIL");
}

console.log("\n═══ C. GET member reporting chain ═══");
{
  const chain = await member(oc, "GET", rohanMem.id, undefined);
  rec("C1 GET own-company member chain",
    "200, first entry is rohan",
    `${chain.status} first=${chain.data?.[0]?.name}`,
    chain.status === 200 && Array.isArray(chain.data) ? "PASS" : "FAIL");

  const foreign = await member(oc, "GET", foreignMem.id, undefined);
  rec("C2 GET another company's membership via our company URL",
    "404 — no cross-tenant chain read",
    `${foreign.status} | data=${JSON.stringify(foreign.data).slice(0, 90)}`,
    foreign.status === 404 ? "PASS" : "FAIL");

  const foreignReports = await member(oc, "GET", foreignMem.id, undefined, "?reports=1");
  rec("C3 foreign member ?reports=1",
    "404",
    `${foreignReports.status} | data=${JSON.stringify(foreignReports.data).slice(0, 90)}`,
    foreignReports.status === 404 ? "PASS" : "FAIL");
}

console.log("\n═══ D. DELETE member ═══");
{
  const foreign = await member(oc, "DELETE", foreignMem.id);
  rec("D1 DELETE another company's membership via our company URL",
    "404 — not a 500",
    `${foreign.status} ${foreign.data?.error ?? ""}`,
    foreign.status === 404 ? "PASS" : "FAIL");

  const missing = await member(oc, "DELETE", "no-such-membership-id");
  rec("D2 DELETE nonexistent membership",
    "404 — not a 500",
    `${missing.status} ${missing.data?.error ?? ""}`,
    missing.status === 404 ? "PASS" : "FAIL");

  const self = await member(oc, "DELETE", ownerMem.id);
  const stillThere = await prisma.userCompany.findUnique({ where: { id: ownerMem.id } });
  rec("D3 owner deletes OWN membership (last owner)",
    "400/403 — company keeps its owner",
    `${self.status} ${self.data?.error ?? ""} | stillMember=${!!stillThere}`,
    (self.status === 400 || self.status === 403) && !!stillThere ? "PASS" : "FAIL");

  // Valid delete: remove the test member created in A4
  const tUser = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  const tMem = tUser ? await prisma.userCompany.findFirst({ where: { userId: tUser.id, companyId: SRG } }) : null;
  const del = await member(oc, "DELETE", tMem.id);
  const gone = await prisma.userCompany.findUnique({ where: { id: tMem.id } });
  const userKept = await prisma.user.findUnique({ where: { id: tUser.id } });
  rec("D4 valid member removal",
    "200 — membership gone, user account kept",
    `${del.status} memGone=${!gone} userKept=${!!userKept}`,
    del.status === 200 && !gone && !!userKept ? "PASS" : "FAIL");

  const noPerm = await member(rc, "DELETE", rohanMem.id);
  rec("D5 rohan (no company.manage) DELETE member",
    "403",
    `${noPerm.status} ${noPerm.data?.error ?? ""}`,
    noPerm.status === 403 ? "PASS" : "FAIL");
}

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}: ${r.actual}`);
await prisma.$disconnect();
