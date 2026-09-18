/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────
// Per-user permission-override test (as OWNER + HR_MANAGER):
//   happy path grant/revoke, invalid keys, self-override escalation,
//   cross-tier target management, cross-company target.
// ─────────────────────────────────────────────────────────────────────
import { prisma } from "@nirman/db";

const BASE = "http://localhost:3000";
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
const anuragUserId = "cmu1990vp000qvlpqpg7h7za7"; // PROJECT_DIRECTOR (tier 2)
const vardaanUserId = "cmu1990sf0002vlpqw5kcsgpa"; // OWNER (tier 1)
const foreignUser = await prisma.user.findFirst({ where: { companyId: OTHER }, select: { id: true } });

console.log("=== signing in ===");
const owner = await demoLogin("OWNER");
const oc = (await signIn(owner.email, owner.password)).cookie;
const hc = (await signIn("hema.testhr@nirman.internal", PW)).cookie;
const rc = (await signIn("rohan.testemp@nirman.internal", PW)).cookie;
console.log("owner:", !!oc, "| hema:", !!hc, "| rohan:", !!rc);
if (!oc || !hc || !rc) { console.log("FATAL: sign-in failed"); process.exit(1); }

const perms = (c, uid, method, body) => api(c, method, `/api/users/${uid}/permissions`, body);

console.log("\n═══ A. Owner happy path ═══");
{
  const before = await perms(oc, rohanUserId, "GET");
  rec("A1 GET rohan permissions",
    "200, role=SITE_ENGINEER",
    `${before.status} role=${before.data?.role} overrides=${JSON.stringify(before.data?.userOverrides)}`,
    before.status === 200 && before.data?.role === "SITE_ENGINEER" ? "PASS" : "FAIL");

  const grant = await perms(oc, rohanUserId, "PATCH", { permissions: ["finance.view"] });
  const after = await perms(oc, rohanUserId, "GET");
  rec("A2 owner grants finance.view → effective includes it",
    "200 + override stored + effective has finance.view",
    `patch=${grant.status} overrides=${JSON.stringify(after.data?.userOverrides)} eff=${after.data?.effective?.includes("finance.view")}`,
    grant.status === 200 && after.data?.userOverrides?.includes("finance.view") && after.data?.effective?.includes("finance.view") ? "PASS" : "FAIL");

  const revoke = await perms(oc, rohanUserId, "PATCH", { permissions: [] });
  const afterR = await perms(oc, rohanUserId, "GET");
  rec("A3 owner revokes → effective back to base",
    "200 + override gone + effective lacks finance.view",
    `patch=${revoke.status} overrides=${JSON.stringify(afterR.data?.userOverrides)} eff=${afterR.data?.effective?.includes("finance.view")}`,
    revoke.status === 200 && afterR.data?.userOverrides?.length === 0 && !afterR.data?.effective?.includes("finance.view") ? "PASS" : "FAIL");

  const bad = await perms(oc, rohanUserId, "PATCH", { permissions: ["finance.view", "nonsense.perm"] });
  rec("A4 invalid permission key",
    "400",
    `${bad.status} ${bad.data?.error ?? ""}`,
    bad.status === 400 ? "PASS" : "FAIL");

  const notArr = await perms(oc, rohanUserId, "PATCH", { permissions: "finance.view" });
  rec("A5 non-array permissions",
    "400",
    `${notArr.status} ${notArr.data?.error ?? ""}`,
    notArr.status === 400 ? "PASS" : "FAIL");
}

console.log("\n═══ B. Privilege-escalation probes (HR_MANAGER actor) ═══");
{
  const self = await perms(hc, hemaUserId, "PATCH", { permissions: ["finance.manage", "company.manage", "users.manage"] });
  const selfAfter = await perms(oc, hemaUserId, "GET");
  const selfEscalated = selfAfter.data?.effective?.includes("finance.manage") && selfAfter.data?.effective?.includes("company.manage");
  rec("B1 hema grants HERSELF elevated permissions",
    "400/403 self-override blocked, no perms written",
    `patch=${self.status} | effective now has finance.manage+company.manage=${selfEscalated}`,
    (self.status === 400 || self.status === 403) && !selfEscalated ? "PASS" : "FAIL");

  const ownerT = await perms(hc, vardaanUserId, "PATCH", { permissions: ["finance.manage"] });
  const ownerAfter = await perms(oc, vardaanUserId, "GET");
  rec("B2 hema modifies the OWNER's overrides (tier 1 target)",
    "403 can't manage above own tier, nothing written",
    `patch=${ownerT.status} | owner overrides=${JSON.stringify(ownerAfter.data?.userOverrides)}`,
    ownerT.status === 403 && !ownerAfter.data?.userOverrides?.includes("finance.manage") ? "PASS" : "FAIL");

  const dirT = await perms(hc, anuragUserId, "PATCH", { permissions: ["finance.manage"] });
  const dirAfter = await perms(oc, anuragUserId, "GET");
  rec("B3 hema modifies tier-2 director's overrides",
    "403 can't manage above own tier, nothing written",
    `patch=${dirT.status} | director overrides=${JSON.stringify(dirAfter.data?.userOverrides)}`,
    dirT.status === 403 && !dirAfter.data?.userOverrides?.includes("finance.manage") ? "PASS" : "FAIL");

  const ok = await perms(hc, rohanUserId, "PATCH", { permissions: ["gate_pass.view"] });
  const okAfter = await perms(oc, rohanUserId, "GET");
  rec("B4 hema modifies lower-tier rohan's overrides (allowed)",
    "200 + stored",
    `patch=${ok.status} overrides=${JSON.stringify(okAfter.data?.userOverrides)}`,
    ok.status === 200 && okAfter.data?.userOverrides?.includes("gate_pass.view") ? "PASS" : "FAIL");
  await perms(oc, rohanUserId, "PATCH", { permissions: [] }); // restore
}

console.log("\n═══ C. Boundary probes ═══");
{
  const foreign = await perms(oc, foreignUser.id, "PATCH", { permissions: ["finance.view"] });
  rec("C1 owner PATCH permissions of a user in another company",
    "404 not a member",
    `${foreign.status} ${foreign.data?.error ?? ""}`,
    foreign.status === 404 ? "PASS" : "FAIL");

  const noPerm = await perms(rc, hemaUserId, "PATCH", { permissions: ["finance.view"] });
  rec("C2 rohan (no users.manage) PATCH hema's permissions",
    "403",
    `${noPerm.status} ${noPerm.data?.error ?? ""}`,
    noPerm.status === 403 ? "PASS" : "FAIL");

  const missing = await perms(oc, "no-such-user", "PATCH", { permissions: ["finance.view"] });
  rec("C3 nonexistent user",
    "404",
    `${missing.status} ${missing.data?.error ?? ""}`,
    missing.status === 404 ? "PASS" : "FAIL");
}

const fails = results.filter((r) => r.verdict === "FAIL");
const warns = results.filter((r) => r.verdict === "WARN");
console.log(`\n════════════════ SUMMARY: ${results.length} checks — ${fails.length} FAIL, ${warns.length} WARN ════════════════`);
for (const r of [...fails, ...warns]) console.log(`  ${r.verdict === "FAIL" ? "❌" : "⚠️"} ${r.name}: ${r.actual}`);
await prisma.$disconnect();
